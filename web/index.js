// @ts-check
import { join } from "path";
import { readFileSync } from "fs";
import express from "express";
import serveStatic from "serve-static";

import shopify from "./shopify.js";
import productCreator from "./product-creator.js";
import PrivacyWebhookHandlers from "./privacy.js";
import mongoose from "mongoose";

const PORT = parseInt(
  process.env.BACKEND_PORT || process.env.PORT || "3000",
  10
);

const STATIC_PATH =
  process.env.NODE_ENV === "production"
    ? `${process.cwd()}/frontend/dist`
    : `${process.cwd()}/frontend/`;

const app = express();

// Set up Shopify authentication and webhook handling
app.get(shopify.config.auth.path, shopify.auth.begin());
app.get(
  shopify.config.auth.callbackPath,
  shopify.auth.callback(),
  shopify.redirectToShopifyOrAppRoot()
);
app.post(
  shopify.config.webhooks.path,
  shopify.processWebhooks({ webhookHandlers: PrivacyWebhookHandlers })
);

// If you are adding routes outside of the /api path, remember to
// also add a proxy rule for them in web/frontend/vite.config.js

app.use("/api/*", shopify.validateAuthenticatedSession());
app.use("/userdata/*", authenticateUser);
app.use(express.json());

// 1. connection to mongoose
// 2. create schema 
// 3. models
// 4. crud operations

const url =
  "mongodb+srv://mahadev:ka039814@cluster0.tiauwuh.mongodb.net/auth-demo?retryWrites=true&w=majority";

mongoose.connect(url)
  .then(() => {
    console.log("--- Connected to Mongoose Successfully ---");
  })
  .catch((error) => {
    console.log("--- Mongoose Can't Connect ---");
  })

let userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
  },
  useremail: {
    type: String,
    required: true,
    unique: true,
  }
});

let User = mongoose.model("userdata", userSchema);

async function authenticateUser(req, res, next) {
  let shop = req.query.shop;
  let storeName = await shopify.config.sessionStorage.findSessionsByShop(shop);
  if(shop === storeName[0].shop) {
    next();
  } else {
    res.send("User Not Authorized");
  }
}

// GETTING STOREFRONT DATA
app.post("/userdata/userinfo", async(req, res) => {
  let userData = req.body;
  try {
    let createUser = await User.create({
      username: userData[0],
      useremail: userData[1],
    });
    console.log("--- User Created Successfully ---");
    res.status(200).json("--- User Created Successfully ---");
  } catch(error) {
    if(error.code === 11000) {
      return res.json("--- User Already Exists ---");
    } else {
      console.log(error.message);
    }
  }
})

app.get("/api/getusers", async(req, res) => {
  try {
    let users = await User.find({});
    res.status(200).send(users);
  }catch(error) {
    console.log(error)
  }
});

// GETTING STORE INFORMATION
app.get("/api/store/info", async(req, res) => {
  let storeInfo = await shopify.api.rest.Shop.all({
    session: res.locals.shopify.session,
  });
  res.status(200).send(storeInfo);
});

// GETTING STORE ORDERS
app.get("/api/orders/all", async(req, res) => {
  let storeOrders = await shopify.api.rest.Order.all({
    session: res.locals.shopify.session,
    status: "any",
  });
  res.status(200).send(storeOrders);
});

// READ ALL PRODUCTS
app.get("/api/product/count", async(req, res) => {
  let totalProducts = await shopify.api.rest.Product.count({
    session: res.locals.shopify.session,
  });
  res.status(200).send(totalProducts);
});

// READ ALL COLLECTIONS
app.get("/api/collection/count", async(req, res) => {
  let totalCollections = await shopify.api.rest.CustomCollection.all({
    session: res.locals.shopify.session,
  });
  res.status(200).send(totalCollections);
})

app.get("/api/products/create", async (_req, res) => {
  let status = 200;
  let error = null;

  try {
    await productCreator(res.locals.shopify.session);
  } catch (e) {
    console.log(`Failed to process products/create: ${e.message}`);
    status = 500;
    error = e.message;
  }
  res.status(status).send({ success: status === 200, error });
});

app.use(shopify.cspHeaders());
app.use(serveStatic(STATIC_PATH, { index: false }));

app.use("/*", shopify.ensureInstalledOnShop(), async (_req, res, _next) => {
  return res
    .status(200)
    .set("Content-Type", "text/html")
    .send(readFileSync(join(STATIC_PATH, "index.html")));
});

app.listen(PORT);
