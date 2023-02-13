const express = require("express");
const multer = require("multer");
const cors = require('cors')
const fs = require("fs");
const path = require("path");

const app = express();
const router = express.Router();
//允许跨域
app.use(cors()) //在 router中间件前面
app.use("/upload", router);
 

const upload = multer({
  storage: multer.diskStorage({
    //设置文件存储位置
    destination: (req, file, cb) => {
      let date = new Date();
      let year = date.getFullYear();
      let month = (date.getMonth() + 1).toString().padStart(2, "0");
      let day = date.getDate(); //直接从根目录开始找
      let dir = "./public/uploads/" + year + month + day;
      //判断目录是否存在，没有则创建
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      //dir就是上传文件存放的目录
      cb(null, dir);
    }, //设置文件名称
    filename: (req, file, cb) => {
      // 获取原来的文件名
      let oldName = file.originalname;
      //获取文件前缀
      let prefix = oldName.startsWith(".") ? oldName : oldName.split(".")[0];
      let fileName =
        prefix + "-" + Date.now() + path.extname(file.originalname);
      //fileName就是上传文件的文件名
      cb(null, fileName);
    },
  }),
}); //访问地址为:localhost:3000/upload/index
router.get("/index", (req, res) => {
  //接口地址为:localhost:3000/upload/postFile ,input的name属性值为imgFile和upload.single("imgFile")对应
  res.send(`
  <form action="http://localhost:3000/upload/postFile" method="post" enctype="multipart/form-data">
  <input id="postFile" type="file" name="fileName" multiple>
  <button type="submit">上传</button>
</form>`);
});
router.post("/postFile", upload.single("fileName"), (req, res, next) => {
  res.json({
    file: req.file,
  });
});

app.listen(3000, () => {
  console.log("server is running at http://localhost:3000");
});
