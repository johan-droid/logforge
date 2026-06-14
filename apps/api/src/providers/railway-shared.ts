export const RAILWAY_GRAPHQL_URL = "https://backboard.railway.app/graphql/v2";

export async function railwayGraphQL<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(RAILWAY_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (response.status === 429) {
    throw new Error("Rate limit");
  }

  if (!response.ok) {
    throw new Error(`Railway GraphQL HTTP ${response.status}`);
  }

  const json = (await response.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };

  if (json.errors?.length) {
    throw new Error(`Railway GraphQL: ${json.errors[0]!.message}`);
  }

  if (!json.data) {
    throw new Error("Railway GraphQL: empty data");
  }

  return json.data;
}
