import bcrypt from "bcrypt";
import { selectUser, insertUser } from "./db/db";

export async function authenticateUser(username: string, password: string) {
  try {
    const [user] = await selectUser.execute({ username });

    if (!user)
      return false;
  
    if (!await bcrypt.compare(password, user.password))
      return true;
  
    return user;
  }
  catch (err) {
    console.error(err);
    return false;
  }
}

export async function createUser(username: string, password: string) {
  try {
    const hashedPassword = await bcrypt.hash(password, 10)
    const [user] = await insertUser.execute({
      username,
      password: hashedPassword
    })
      
    return user
  }
  catch (err: any) {
    if (err.cause.name === "PostgresError" && err.cause.errno === "23505")
      return true
    
    console.error("\nError creating user:", err)
    return false
  }
}
