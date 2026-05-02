const CACHE_NAME = 'kyo-oracle-v65';
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./quiz/index.html",
  "./style.css",
  "./script.js",
  "./cart.js",
  "./cart.css",
  "./drinks.json",
  "./drinks/index.html",
  "./order/success.html",
  "./admin/orders.js",
  "./manifest.json",
  "./images/cold_drinks/coffee/balanced/foamy/classic/energizing/iced_americano_matcha_foam.png",
  "./images/cold_drinks/coffee/balanced/standard/classic/energizing/iced_latte.png",
  "./images/cold_drinks/coffee/natural/refreshing/classic/energizing/iced_americano.png",
  "./images/cold_drinks/earthy/balanced/foamy/dessert/chill/iced_orgeade_matcha.png",
  "./images/cold_drinks/earthy/balanced/foamy/floral/chill/iced_coconut_cloud_matcha.png",
  "./images/cold_drinks/earthy/balanced/foamy/floral/chill/iced_foam_jasmine.png",
  "./images/cold_drinks/earthy/balanced/foamy/floral/chill/iced_hojicha_latte_lavender_coldfoam.png",
  "./images/cold_drinks/earthy/balanced/standard/classic/energizing/iced_matcha_latte.png",
  "./images/cold_drinks/earthy/balanced/standard/classic/energizing/kocha_latte.png",
  "./images/cold_drinks/earthy/natural/foamy/floral/energizing/iced_foam_rose.png",
  "./images/cold_drinks/earthy/natural/refreshing/classic/energizing/iced_matcha_soda.png",
  "./images/cold_drinks/earthy/natural/refreshing/classic/energizing/sencha_tea.png",
  "./images/cold_drinks/earthy/sweet/foamy/dessert/indulgent/iced_cold_foam_vanilla.png",
  "./images/cold_drinks/earthy/sweet/foamy/fruity/indulgent/iced_banana_matcha.png",
  "./images/cold_drinks/earthy/sweet/foamy/fruity/indulgent/iced_cold_foam_strawberry.png",
  "./images/cold_drinks/earthy/sweet/standard/fruity/indulgent/iced_mango_matcha.png",
  "./images/cold_drinks/earthy/sweet/standard/fruity/indulgent/iced_strawberry_matcha.png",
  "./images/cold_drinks/nutty_roasty/balanced/foamy/floral/chill/iced_hojicha_lavender_coldfoam.png",
  "./images/cold_drinks/nutty_roasty/sweet/foamy/dessert/indulgent/iced_hojicha_vanilla_coldfoam.png",
  "./images/cold_drinks/nutty_roasty/sweet/foamy/dessert/indulgent/iced_hojicha_iced_creamy.png",

  "./images/hot_drinks/coffee/balanced/foamy/classic/energizing/hot_cappuccino.png",
  "./images/hot_drinks/coffee/balanced/standard/classic/relaxed/hot_latte.png",
  "./images/hot_drinks/coffee/natural/refreshing/classic/energizing/hot_americano.png",
  "./images/hot_drinks/coffee/natural/standard/classic/energizing/cortado.png",
  "./images/hot_drinks/coffee/natural/standard/classic/energizing/flat_white.png",
  "./images/hot_drinks/coffee/natural/standard/classic/energizing/hot_espresso.png",
  "./images/hot_drinks/coffee/sweet/standard/dessert/indulgent/hot_chocolate.png",
  "./images/hot_drinks/nutty_roasty/balanced/standard/classic/relaxed/hot_hojicha_latte.png",
  "./images/hot_drinks/nutty_roasty/natural/refreshing/dessert/chill/hojicha_hot_tea.png",
  "./images/hot_drinks/surprise/natural/refreshing/classic/chill/kocha_hot_tea.png",
  "./images/hot_drinks/surprise/natural/refreshing/classic/chill/hot_kocha_latte.png",
  "./images/icons/icon-192.png",
  "./images/icons/icon-512.png",
  "./images/qr_code.png"
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // Skip cross-origin requests (e.g. API calls to kyoklubv.vercel.app)
  // and non-GET requests — these should never be intercepted by the SW
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // We received a valid network response, return it (Live Data)
        return response;
      })
      .catch(() => {
        // Network failed (user is offline), fallback to the cache
        return caches.match(event.request);
      })
  );
});
