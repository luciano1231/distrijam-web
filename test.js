const { JSDOM } = require("jsdom");
const fs = require("fs");

const html = fs.readFileSync("producto.html", "utf8");
const appJs = fs.readFileSync("app.js", "utf8");
const cartJs = fs.readFileSync("cart.js", "utf8");
const productoJs = fs.readFileSync("producto.js", "utf8");

const dom = new JSDOM(html, {
  url: "http://localhost/producto.html?id=tuerca-hexagonal-bicromada-m6",
  runScripts: "dangerously"
});

const { window } = dom;
const { document } = window;

// Mock fetch
window.fetch = async (url) => {
  return {
    ok: true,
    json: async () => JSON.parse(fs.readFileSync("productos.json", "utf8"))
  };
};

try {
  window.eval(appJs);
  window.eval(cartJs);
  window.eval(productoJs);

  setTimeout(() => {
    try {
      console.log("Product title:", document.getElementById("prod-title").textContent);
      
      const btn = document.getElementById("btn-add-to-cart");
      if (!btn) {
        console.log("No add to cart btn");
        return;
      }
      
      console.log("Clicking add to cart...");
      btn.click();
      
      console.log("Cart length:", window.cart.length);
      console.log("Toast showed:", document.querySelector('.toast-container')?.innerHTML);
      console.log("Cart items HTML:", document.getElementById("cart-items").innerHTML);
    } catch(e) {
      console.error("Error during click:", e);
    }
  }, 1000);
  
} catch (err) {
  console.error("Error evaluating scripts:", err);
}
