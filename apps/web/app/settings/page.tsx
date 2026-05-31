import { SettingsClient } from "./SettingsClient";

type SettingsPageProps = {
  searchParams: Promise<{ provider?: string }>;
};

export default async function SettingsPage({
  searchParams,
}: SettingsPageProps) {
  const params = await searchParams;
  return <SettingsClient initialProvider={params.provider || "render"} />;
}
