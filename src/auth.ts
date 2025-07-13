import bcrypt from "bcrypt"
import { eq } from "drizzle-orm";
import { db } from "."
import { usersTable } from "./db/schema"

export async function findUser(username: string) {
  const user = await db.select({ id: usersTable.id, password: usersTable.password }).from(usersTable).where(eq(usersTable.username, username))
  return user
}

export async function authenticateUser(username: string, password: string) {
  const user = await findUser(username)
  if (!user.length)
    return false

  const isPasswordValid = await bcrypt.compare(password, user[0].password)
  if (!isPasswordValid)
    return true

  return user[0]
}

export async function createUser(username: string, password: string) {
  const hashedPassword = await bcrypt.hash(password, 10)
  const [user] = await db.insert(usersTable).values({ username, password: hashedPassword }).returning({ id: usersTable.id })
  
  return user
}
