// import bcrypt from "bcrypt"
// import { eq } from "drizzle-orm";
// import { db } from "."
// import { usersTable } from "./db/schema"

// export async function findUser(username: string) {
//   try {
//     const data = await db.select({
//       id: usersTable.id,
//       password: usersTable.password
//     })
//       .from(usersTable)
//       .where(eq(
//         usersTable.username,
//         username
//       ))

//     return data
//   }
//   catch (error) {
//     return []
//   }
// }

// export async function authenticateUser(username: string, password: string) {
//   const [user] = await findUser(username)
//   if (!user)
//     return false

//   const isPasswordValid = await bcrypt.compare(password, user.password)
//   if (!isPasswordValid)
//     return true

//   return user
// }

// export async function createUser(username: string, password: string) {
//   const hashedPassword = await bcrypt.hash(password, 10)

//   try {
//     const [user] = await db.insert(usersTable)
//       .values({
//         username,
//         password: hashedPassword
//       })
//       .returning({
//         id: usersTable.id,
//         username: usersTable.username,
//         password: usersTable.password
//       })
      
//     return user
//   }
//   catch (err: any) {
//     if (err.cause.name === "PostgresError" && err.cause.errno === "23505")
//       return true
    
//     console.error("\nError creating user:", err)
//     return false
//   }
// }
