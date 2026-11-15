import { describe, expect, it } from "bun:test";
import { applyBatch, assertSingleStatement, deleteRow, introspect, qid, readTable, serialize, updateCell } from "../src/service/db.js";

describe("SQL helpers", () => {
  it("quotes identifiers without changing the identifier boundary", () => {
    expect(qid("public")).toBe('"public"');
    expect(qid('odd"name')).toBe('"odd""name"');
  });

  it("serializes database values for the panel", () => {
    expect(serialize(null)).toBeNull();
    expect(serialize(undefined)).toBeNull();
    expect(serialize(new Date("2026-01-02T03:04:05Z"))).toBe("2026-01-02T03:04:05.000Z");
    expect(serialize({ active: true })).toBe('{"active":true}');
    expect(serialize(42)).toBe("42");
  });

  it("accepts one statement with semicolons inside literals and comments", () => {
    expect(() => assertSingleStatement("select ';' as value; -- trailing;\n")).not.toThrow();
    expect(() => assertSingleStatement("select 1 /* ; */;")).not.toThrow();
  });

  it("rejects multiple statements", () => {
    expect(() => assertSingleStatement("select 1; select 2")).toThrow("Only one SQL statement");
  });
});

describe("primary key metadata", () => {
  it("exposes introspected PK metadata only for single-column primary keys", async () => {
    const sql = async (strings) => {
      const query = strings.join("?");
      if (query.includes("c.reltuples")) {
        return [
          { schema: "public", table: "memberships", kind: "r", approx_rows: 2 },
          { schema: "public", table: "users", kind: "r", approx_rows: 1 },
        ];
      }
      if (query.includes("format_type")) {
        return [
          { schema: "public", table: "memberships", name: "tenant_id", type: "integer", nullable: false },
          { schema: "public", table: "memberships", name: "user_id", type: "integer", nullable: false },
          { schema: "public", table: "users", name: "id", type: "integer", nullable: false },
        ];
      }
      if (query.includes("from pg_index")) {
        return [
          { schema: "public", table: "memberships", name: "tenant_id" },
          { schema: "public", table: "memberships", name: "user_id" },
          { schema: "public", table: "users", name: "id" },
        ];
      }
      throw new Error(`Unexpected introspection query: ${query}`);
    };

    const [schema] = await introspect(sql);
    const memberships = schema.tables.find((table) => table.name === "memberships");
    const users = schema.tables.find((table) => table.name === "users");
    expect(memberships.primaryKey).toBeNull();
    expect(memberships.columns.every((column) => !column.pk)).toBe(true);
    expect(users.primaryKey).toBe("id");
    expect(users.columns[0].pk).toBe(true);
  });

  it("returns table PK metadata only when exactly one PK column exists", async () => {
    const readWithPks = (pks) => {
      const sql = async (strings) => {
        const query = strings.join("?");
        if (query.includes("information_schema.columns")) {
          return [
            { name: "tenant_id", type: "integer", nullable: "NO" },
            { name: "user_id", type: "integer", nullable: "NO" },
          ];
        }
        if (query.includes("from pg_index")) return pks;
        throw new Error(`Unexpected metadata query: ${query}`);
      };
      sql.unsafe = async (query) => query.startsWith("select count") ? [{ n: 0 }] : [];
      return readTable(sql, { schema: "public", table: "memberships" });
    };

    expect((await readWithPks([{ name: "tenant_id" }, { name: "user_id" }])).pk).toBeNull();
    expect((await readWithPks([{ name: "tenant_id" }])).pk).toBe("tenant_id");
  });
});

describe("applyBatch", () => {
  it("applies panel update/delete operations in one transaction", async () => {
    const calls = [];
    let released = false;
    const conn = {
      unsafe: async (query, params) => {
        calls.push({ query, params });
        return { count: 1 };
      },
      release: () => { released = true; },
    };
    const result = await applyBatch({ reserve: async () => conn }, {
      schema: "public",
      table: "users",
      pk: "id",
      ops: [
        { op: "update", pkVal: "7", col: "name", now: "New name", valNull: false },
        { op: "delete", pkVal: "8" },
      ],
    });

    expect(result.count).toBe(2);
    expect(calls[0].query).toBe("begin");
    expect(calls[1].query).toContain('update "public"."users"');
    expect(calls[1].params).toEqual(["New name", "7"]);
    expect(calls[2].query).toContain('delete from "public"."users"');
    expect(calls[2].params).toEqual(["8"]);
    expect(calls.at(-1).query).toBe("commit");
    expect(released).toBe(true);
  });

  it("rolls back and releases the connection after an error", async () => {
    const queries = [];
    let released = false;
    const conn = {
      unsafe: async (query) => {
        queries.push(query);
        if (query.startsWith("delete")) throw new Error("delete failed");
        return { count: 0 };
      },
      release: () => { released = true; },
    };

    await expect(applyBatch({ reserve: async () => conn }, {
      schema: "public",
      table: "users",
      pk: "id",
      ops: [{ op: "delete", pkVal: "8" }],
    })).rejects.toThrow("delete failed");
    expect(queries).toEqual(["begin", 'delete from "public"."users" where "id" = $1', "rollback"]);
    expect(released).toBe(true);
  });

  it("rolls back when a duplicate first PK component would update multiple rows", async () => {
    const queries = [];
    let released = false;
    const conn = {
      unsafe: async (query) => {
        queries.push(query);
        return { count: query.startsWith("update") ? 2 : 0 };
      },
      release: () => { released = true; },
    };

    await expect(applyBatch({ reserve: async () => conn }, {
      schema: "public",
      table: "memberships",
      pk: "tenant_id",
      ops: [{ op: "update", pkVal: "7", col: "role", now: "admin", valNull: false }],
    })).rejects.toThrow("exactly one row");
    expect(queries).toEqual([
      "begin",
      'update "public"."memberships" set "role" = $1 where "tenant_id" = $2',
      "rollback",
    ]);
    expect(released).toBe(true);
  });

  it("rolls back when a delete affects no rows", async () => {
    const queries = [];
    let released = false;
    const conn = {
      unsafe: async (query) => {
        queries.push(query);
        return { count: 0 };
      },
      release: () => { released = true; },
    };

    await expect(applyBatch({ reserve: async () => conn }, {
      schema: "public",
      table: "users",
      pk: "id",
      ops: [{ op: "delete", pkVal: "missing" }],
    })).rejects.toThrow("affected: 0");
    expect(queries).toEqual(["begin", 'delete from "public"."users" where "id" = $1', "rollback"]);
    expect(released).toBe(true);
  });

  it("rejects an oversized batch before reserving a connection", async () => {
    let reserved = false;
    const sql = {
      reserve: async () => {
        reserved = true;
        throw new Error("must not reserve");
      },
    };
    const ops = Array.from({ length: 501 }, () => ({ op: "delete", pkVal: "1" }));

    await expect(applyBatch(sql, {
      schema: "public",
      table: "users",
      pk: "id",
      ops,
    })).rejects.toThrow("at most 500");
    expect(reserved).toBe(false);
  });

  it("rejects unknown and incomplete operations before reserving a connection", async () => {
    let reserved = false;
    const sql = {
      reserve: async () => {
        reserved = true;
        throw new Error("must not reserve");
      },
    };
    const batch = (ops) => applyBatch(sql, { schema: "public", table: "users", pk: "id", ops });

    await expect(batch([{ op: "truncate", pkVal: "1" }])).rejects.toThrow("Unknown operation type");
    await expect(batch([{ op: "update", pkVal: "1", now: "missing column" }])).rejects.toThrow("Updates require col and now");
    await expect(batch([{ op: "delete" }])).rejects.toThrow("Each operation requires pkVal");
    expect(reserved).toBe(false);
  });
});

describe("legacy single-operation helpers", () => {
  it("uses batch transaction and inheritance semantics for updates and deletes", async () => {
    const calls = [];
    let releases = 0;
    const conn = {
      unsafe: async (query, params) => {
        calls.push({ query, params });
        return { count: 1 };
      },
      release: () => { releases += 1; },
    };
    const sql = { reserve: async () => conn };

    expect((await updateCell(sql, {
      schema: "public", table: "users", pkCol: "id", pkVal: "7", col: "name", val: "New name",
    })).count).toBe(1);
    expect((await deleteRow(sql, {
      schema: "public", table: "users", pkCol: "id", pkVal: "8",
    })).count).toBe(1);

    expect(calls.map((call) => call.query)).toEqual([
      "begin",
      'update "public"."users" set "name" = $1 where "id" = $2',
      "commit",
      "begin",
      'delete from "public"."users" where "id" = $1',
      "commit",
    ]);
    expect(calls[1].params).toEqual(["New name", "7"]);
    expect(calls[4].params).toEqual(["8"]);
    expect(calls.every(({ query }) => !/\bonly\b/i.test(query))).toBe(true);
    expect(releases).toBe(2);
  });

  it("enforces exactly one affected row for updates and deletes", async () => {
    const cases = [
      {
        run: (sql) => updateCell(sql, {
          schema: "public", table: "users", pkCol: "id", pkVal: "7", col: "name", val: "New name",
        }),
        statement: 'update "public"."users" set "name" = $1 where "id" = $2',
      },
      {
        run: (sql) => deleteRow(sql, { schema: "public", table: "users", pkCol: "id", pkVal: "8" }),
        statement: 'delete from "public"."users" where "id" = $1',
      },
    ];

    for (const testCase of cases) {
      const queries = [];
      let released = false;
      const conn = {
        unsafe: async (query) => {
          queries.push(query);
          return { count: 0 };
        },
        release: () => { released = true; },
      };

      await expect(testCase.run({ reserve: async () => conn })).rejects.toThrow("exactly one row");
      expect(queries).toEqual(["begin", testCase.statement, "rollback"]);
      expect(released).toBe(true);
    }
  });
});
