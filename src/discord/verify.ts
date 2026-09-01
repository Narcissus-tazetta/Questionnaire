import { verifyKey } from "discord-interactions";

/**
 * Verifies the Ed25519 signature Discord attaches to every interaction request.
 * Returns the parsed body on success, or null when the signature is missing/invalid.
 */
export async function verifyRequest(
  request: Request,
  publicKey: string,
): Promise<unknown | null> {
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");
  if (!signature || !timestamp) return null;

  const rawBody = await request.text();
  const valid = await verifyKey(rawBody, signature, timestamp, publicKey);
  if (!valid) return null;

  return JSON.parse(rawBody);
}
