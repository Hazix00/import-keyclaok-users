import KcAdminClient from "@keycloak/keycloak-admin-client";
import users from "./clients-users.json" assert { type: "json" };
import fs, { existsSync } from "fs";
import { MongoClient } from "mongodb";

// Connection URL
const url = "mongodb://admin:admin@localhost:27017/dmp-metier";
const client = new MongoClient(url);

const connection = await client.connect();
console.log("Connected successfully to server");
const db = client.db("dmp-metier");
const collection = db.collection("users");

const kcAdminClient = new KcAdminClient({
  baseUrl: "http://localhost:8080/auth",
});
async function auth() {
  // Authorize with username / password
  await kcAdminClient.auth({
    username: "admin",
    password: "password",
    grantType: "password",
    clientId: "admin-cli",
  });
}

async function checkRealmExists(realm) {
  await auth();
  const res = await kcAdminClient.realms.findOne({ realm });
  return !!res;
}

async function createRealm(realm) {
  const realmExists = await checkRealmExists(realm);
  if (!realmExists) {
    try {
      await auth();
      await kcAdminClient.realms.create({
        realm: realm,
        enabled: true,
        roles: {
          realm: [{ name: "leader" }],
        },
        accessTokenLifespan: 43200,
      });
      console.log("realm", realm, "created");
    //   await auth();
    //   await kcAdminClient.roles.create({ name: "leader", realm });
    //   console.log("role leader created for realm", realm);h();
    //   await kcAdminClient.roles.create({ name: "leader", realm });
    //   console.log("role leader created for realm", realm);
    } catch (error) {
      console.log(error);
    }
  } else {
    console.log("realm", realm, "already exists");
  }
}

async function checkUserExists({ email, realm }) {
  await auth();
  const res = await kcAdminClient.users.find({ email, realm });
  return res;
}
async function createUser(user) {
  const userExists = await checkUserExists(user);
  let res;
  if (userExists?.length === 0) {
    try {
      await auth();
      res = await kcAdminClient.users.create({
        realm: user.realm,
        username: user.username,
        email: user.email,
        enabled: true,
        firstName: user.firstname,
        lastName: user.lastname,
        emailVerified: true,
        credentials: [
          {
            type: "password",
            temporary: false,
            value: "123",
          },
        ],
      });

      console.log("user", user.email, "created");
    } catch (error) {
      console.log(error);
    }
  } else {
    try {
      res = userExists[0];
      console.log("user", user.email, "already exists");
      //   console.log("res", res);
    } catch (error) {
      console.log(error);
    }
  }
  try {
    await auth();
    const pass = await kcAdminClient.users.resetPassword({
      id: res.id,
      realm: user.realm,
      credential: { value: 123 },
    });
    console.log("pass", pass);
  } catch (error) {
    console.log(error);
  }
  return res;
}

let errorsEmails = "";
let updatedEmails = "";
for (let user of users) {
  try {
    await createRealm(user.realm);
    const res = await createUser(user);
    console.log(
      user.email,
      "old keycloakId",
      user.keycloackId,
      "new :",
      res.id
    );
    user.keycloackId = res.id;
    user.id = res.id;
    // if (user.roles.some((role) => role.name === "leader")) {
    //   await kcAdminClient.users.addClientRoleMappings({
    //     id: res.id,
    //     roles: [{ name: "leader", id: "d730f1c7-f848-4de0-b2d8-767453d47e8c" }],
    //   });
    //   console.log("role is set");
    // }
    const newUserResult = await collection.updateOne(
      { email: user.email },
      {
        $set: {
          keycloackId: user.keycloackId,
          id: user.id,
        },
      }
    );
    console.log("user updated in mogodb", user.email);
    updatedEmails += user.email + "\n";
  } catch (error) {
    console.error(error);
    errorsEmails += user.email + "\n";
  }
}

fs.writeFileSync("./errors-mongo.log", errorsEmails);
fs.writeFileSync("./updatedUsers-mongo.log", updatedEmails);
fs.writeFileSync("./users-updated.json", JSON.stringify(users, null, 2));
connection.close();
existsSync();
// const leaders = users.filter(user => user.roles.some(role => role.name === 'leader'));

// fs.writeFileSync( __dirname+'/dmp-users-leaders.json', JSON.stringify(leaders, null, 2));
