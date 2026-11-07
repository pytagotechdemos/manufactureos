"use client";

import { useState } from "react";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
}

export default function AdministrationPage() {
  const users: User[] = [
    { id: "1", name: "Admin User", email: "admin@manufactureos.local", role: "Administrator", status: "ACTIVE" },
    { id: "2", name: "Planner", email: "planner@manufactureos.local", role: "Planner", status: "ACTIVE" },
    { id: "3", name: "Storekeeper", email: "storekeeper@manufactureos.local", role: "Storekeeper", status: "ACTIVE" },
    { id: "4", name: "QC Inspector", email: "qc@manufactureos.local", role: "Quality Inspector", status: "ACTIVE" },
  ];
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-blue-700">Administration</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Administration</h1>
        <p className="mt-2 text-sm text-slate-600">Manage users, roles, and system configuration.</p>
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {notice ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-lg border border-slate-200 bg-white p-6 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="font-semibold">Users</h2>
          </div>
          <div className="p-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Name</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-5 py-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td className="px-5 py-3 font-medium">{user.name}</td>
                      <td className="px-4 py-3">{user.email}</td>
                      <td className="px-4 py-3">{user.role}</td>
                      <td className="px-5 py-3 text-right">
                        <span className={`rounded-full px-2 py-1 text-xs ${user.status === "ACTIVE" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                          {user.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="font-semibold">Create User</h2>
          </div>
          <div className="p-4 space-y-4">
            <form className="space-y-4" onSubmit={(e) => {
              e.preventDefault();
              setLoading(true);
              setError(null);
              try {
                const formData = new FormData(e.currentTarget);
                setNotice(`User ${formData.get("name")} created (demo mode).`);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to create user");
              } finally {
                setLoading(false);
              }
            }}>
              <label className="block text-sm font-medium">Full Name</label>
              <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" name="name" required />
              <label className="block text-sm font-medium mt-2">Email</label>
              <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" name="email" type="email" required />
              <label className="block text-sm font-medium mt-2">Role</label>
              <select className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" name="role" required>
                <option value="Administrator">Administrator</option>
                <option value="Planner">Planner</option>
                <option value="Storekeeper">Storekeeper</option>
                <option value="Quality Inspector">Quality Inspector</option>
              </select>
              <button className="w-full rounded-md bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60" disabled={loading} type="submit">
                {loading ? "Creating..." : "Create User"}
              </button>
            </form>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="font-semibold">System Configuration</h2>
          </div>
          <div className="p-4 space-y-4">
            <div className="border border-slate-200 rounded-lg p-4">
              <p className="text-sm text-slate-600">Better Auth closed registration is enabled.</p>
              <p className="text-xs text-slate-500 mt-1">Users must be created by an administrator.</p>
            </div>
            <div className="border border-slate-200 rounded-lg p-4">
              <p className="text-sm text-slate-600">PostgreSQL: localhost:5433</p>
              <p className="text-xs text-slate-500 mt-1">17 migrations applied.</p>
            </div>
            <div className="border border-slate-200 rounded-lg p-4">
              <p className="text-sm text-slate-600">Inventory costing: Moving weighted average.</p>
              <p className="text-xs text-slate-500 mt-1">BOMs: Immutable once approved.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
