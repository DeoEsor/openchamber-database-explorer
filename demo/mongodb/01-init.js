db.createCollection("workspaces");
db.createCollection("audit_events");

db.workspaces.createIndex({ slug: 1 }, { unique: true });
db.audit_events.createIndex({ workspaceId: 1, createdAt: -1 });

const workspaces = [
  { name: "Northwind Labs", slug: "northwind", plan: "Scale", region: "us-east-1", members: 42, features: ["audit-log", "sso", "analytics"] },
  { name: "Acme Robotics", slug: "acme", plan: "Business", region: "eu-central-1", members: 18, features: ["audit-log", "sso"] },
  { name: "Luminary Systems", slug: "luminary", plan: "Scale", region: "eu-west-2", members: 31, features: ["audit-log", "analytics"] },
  { name: "Vertex Cloud", slug: "vertex", plan: "Starter", region: "eu-west-1", members: 6, features: ["analytics"] },
  { name: "Mosaic AI", slug: "mosaic", plan: "Scale", region: "ap-southeast-1", members: 57, features: ["audit-log", "sso", "analytics", "scim"] },
  { name: "Quantica", slug: "quantica", plan: "Scale", region: "ap-northeast-1", members: 64, features: ["audit-log", "sso", "analytics"] }
];

const inserted = db.workspaces.insertMany(workspaces.map((workspace, index) => ({
  ...workspace,
  status: "active",
  externalRef: new ObjectId(`6500000000000000000000${String(index).padStart(2, "0")}`),
  budget: Decimal128.fromString((12500.5 + index * 750.25).toFixed(2)),
  seatLimit: NumberLong(String(100 + index * 25)),
  billing: { currency: "USD", taxRate: Decimal128.fromString(index % 2 ? "20.00" : "0.00") },
  optionalNote: index === 0 ? null : `Demo workspace ${index + 1}`,
  ...(index === 0 ? { legacyCode: "NW-001" } : {}),
  createdAt: new Date(Date.UTC(2026, index, 4, 9, 30)),
  updatedAt: new Date("2026-10-28T12:00:00Z")
})));

db.audit_events.insertMany(workspaces.flatMap((workspace, workspaceIndex) => {
  const workspaceId = inserted.insertedIds[workspaceIndex];
  return [
    { workspaceId, action: "workspace.updated", actor: "admin@example.test", metadata: { field: "features" }, createdAt: new Date("2026-10-28T11:42:00Z") },
    { workspaceId, action: "member.invited", actor: "owner@example.test", metadata: { role: "developer" }, createdAt: new Date("2026-10-27T15:18:00Z") },
    { workspaceId, action: "api_key.created", actor: "automation@example.test", metadata: { scope: "read" }, createdAt: new Date("2026-10-26T08:05:00Z") }
  ];
}));
