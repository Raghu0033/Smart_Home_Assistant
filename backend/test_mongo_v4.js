import mongoose from 'mongoose';

const uri = "mongodb://mummanarakesh_db_user:GJvSOplw2q9iJSb1@ac-gaegrkz-shard-00-00.4pozyn4.mongodb.net:27017,ac-gaegrkz-shard-00-01.4pozyn4.mongodb.net:27017,ac-gaegrkz-shard-00-02.4pozyn4.mongodb.net:27017/?ssl=true&replicaSet=atlas-gaegrkz-shard-0&authSource=admin&retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(uri, { family: 4 })
  .then(() => {
    console.log("Connected successfully with IPv4!");
    process.exit(0);
  })
  .catch(err => {
    console.error("Failed to connect:", err.message);
    process.exit(1);
  });
