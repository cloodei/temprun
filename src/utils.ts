const refreshExpiredTime = Number(process.env.REFRESH_EXPIRATION_TIME!), refreshHashSecret = process.env.REFRESH_HASH_SECRET!;
const hasher = new Bun.CryptoHasher("sha256");

export function refreshTokenCheck(tokenDate: Date) {
  const now = new Date();
  if (tokenDate > now)
    return false;

  const refreshExpiredDate = new Date(now);
  refreshExpiredDate.setDate(now.getDate() - refreshExpiredTime);

  return tokenDate >= refreshExpiredDate;
}

export function hashToken(token: string) {
  return hasher.update(refreshHashSecret + token).digest("hex");
}
