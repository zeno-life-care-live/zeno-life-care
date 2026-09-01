# ZenoLife Care FREE v6

Premium Blossom-style medicine retailer/customer portal using Firebase Authentication + Firestore, designed to stay on Firebase Spark/free plan (no Cloud Functions).

Features:
- Separate Admin login and dashboard with session persistence
- Medicine image add/update, category, composition, stock, expiry, MRP, sell/N. Rate
- Purchase Rate, GST and Transport stored in admin-only medicinePrivate collection
- Customer search by medicine name or composition
- Category filters, cart, multi-item order summary, order cancellation and order history
- Customer support call/email
- Customer profile and password change
- Admin customer create + block/unblock access
- Admin order status workflow and stock deduction on completion
- Low-stock and expiry alerts
- CSV export for medicines and orders
- Separate drug details page

Important: publish firestore.rules in Firebase Console. Never upload service-account JSON or private credentials to GitHub.


## Offer rules v8
- Only a cart/order with a total of at least ₹1500 is a qualifying order.
- All qualifying orders placed within the same 6-day window count as ONE qualifying order.
- The first qualifying order starts the 6-day window; a qualifying order after that window starts the next one.
- 20 qualifying completed orders unlock ₹100 OFF.
- 40 qualifying completed orders unlock ₹250 OFF.
- Non-qualifying orders (below ₹1500) do not increase the offer counter.
- Cancelled orders do not count.
