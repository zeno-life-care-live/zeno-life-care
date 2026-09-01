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
