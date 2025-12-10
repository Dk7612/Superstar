const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static("."));

let users = {
  "Pumpkin@2012": { role: "superadmin", lockedDevice: null }
};

app.post("/login", (req, res) => {
  const { code, deviceID } = req.body;
  if(users[code]){
    users[code].lockedDevice = deviceID;
    res.json({ok:true, role:users[code].role});
  } else {
    res.json({ok:false, error:"Invalid code"});
  }
});

app.post("/generate", (req, res) => {
  const role = req.body.role;
  const code = Math.random().toString(36).substring(2,8);
  users[code] = { role, lockedDevice: null };
  res.json({ code });
});

app.get("/users", (req,res)=>{ res.json(users); });

app.post("/reset", (req,res)=>{
  const { code } = req.body;
  if(users[code]) users[code].lockedDevice = null;
  res.json({ok:true});
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log(`Server running on port ${PORT}`));
