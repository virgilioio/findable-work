/**
 * App User Connector helpers — SERVER ONLY.
 * Never import from client bundles: reads LOVABLE_API_KEY from process.env
 * and forwards it to the connector gateway.
 */

function requireApiKey(): string {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not set.");
  return key;
}

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";

export interface AppUserOAuthAuthorizeParams {
  connectorId: string;
  appUserId: string;
  connectorClientId: string;
  returnUrl: string;
  credentialsConfiguration?: Record<string, unknown>;
}

export async function authorizeAppUserOAuth(
  params: AppUserOAuthAuthorizeParams,
): Promise<{ authorizationUrl: string; sessionId: string }> {
  const res = await fetch(
    `${GATEWAY_BASE_URL}/api/v1/app-users/oauth2/authorize`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requireApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        connector_id: params.connectorId,
        app_user_id: params.appUserId,
        connector_client_id: params.connectorClientId,
        return_url: params.returnUrl,
        credentials_configuration: params.credentialsConfiguration,
      }),
    },
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`App User OAuth start failed (${res.status}): ${text || res.statusText}`);
  }
  const body = text ? JSON.parse(text) : {};
  if (!body.authorization_url) throw new Error("Missing authorization_url");
  return { authorizationUrl: body.authorization_url, sessionId: body.session_id ?? "" };
}

export interface CallAsAppUserParams {
  connectionId: string;
  connectorId: string;
  path: string;
  init?: RequestInit;
}

export async function callAsAppUser({
  connectionId,
  connectorId,
  path,
  init,
}: CallAsAppUserParams): Promise<Response> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${requireApiKey()}`);
  headers.set("X-App-User-Connection-Id", connectionId);
  return fetch(`${GATEWAY_BASE_URL}/${connectorId}${normalizedPath}`, {
    ...init,
    headers,
  });
}