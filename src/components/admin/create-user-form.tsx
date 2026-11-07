"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";

type Role = { id: string; code: string; name: string; permissions: { permission: { code: string } }[] };

export function CreateUserForm() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/v1/roles")
      .then((res) => res.json())
      .then((json) => {
        setRoles(json.data ?? []);
        setLoadingRoles(false);
      })
      .catch(() => setLoadingRoles(false));
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, roleId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Failed to create account");
      setNotice(`Account created for ${json.data.email}.`);
      setName("");
      setEmail("");
      setPassword("");
      setRoleId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create account");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingRoles) return null;

  return (
    <Card>
      <CardHeader title="Create account" description="Registration stays closed — accounts are provisioned here only." />
      <CardBody className="space-y-4">
        {error ? <Alert tone="danger" onClose={() => setError(null)}>{error}</Alert> : null}
        {notice ? <Alert tone="success" onClose={() => setNotice(null)}>{notice}</Alert> : null}
        <form className="space-y-3" onSubmit={handleSubmit}>
          <Field htmlFor="create-user-name" label="Full name" required>
            <Input id="create-user-name" name="name" onChange={(e) => setName(e.target.value)} required value={name} />
          </Field>
          <Field htmlFor="create-user-email" label="Work email" required>
            <Input id="create-user-email" name="email" onChange={(e) => setEmail(e.target.value)} required type="email" value={email} />
          </Field>
          <Field htmlFor="create-user-password" label="Password" hint="At least 12 characters" required>
            <Input id="create-user-password" name="password" onChange={(e) => setPassword(e.target.value)} required type="password" value={password} />
          </Field>
          <Field htmlFor="create-user-role" label="Role" required>
            <Select id="create-user-role" name="roleId" onChange={(e) => setRoleId(e.target.value)} required value={roleId}>
              <option value="">Select a role</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name} ({role.code})
                </option>
              ))}
            </Select>
          </Field>
          <Button className="w-auto" disabled={submitting || !roleId} loading={submitting} type="submit" variant="primary">
            <Plus aria-hidden className="size-4 mr-2" /> Create account
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
