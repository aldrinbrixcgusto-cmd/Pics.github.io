# Our Vibe

## File structure

`index.html` is the page, `styles.css` is the visual design, and `script.js` runs the shared gallery. Put optional starter images in the `images/` folder.

## Run it

Open `index.html` in any modern browser. No installation or web server is needed.

## Starter images

Add files with these names to `images/` to replace the starter placeholders:

- `first-date.jpg`
- `sunset-walk.jpg`
- `coffee-morning.jpg`
- `anniversary-dinner.jpg`

To use different filenames, update the `starterPhotos` list at the top of `script.js`.

## Shared uploads with Supabase

Uploaded photos, filenames, and captions now live in Supabase, so both people see the same album after signing in. The project URL and publishable key are already set in `script.js`; never put a secret or service-role key there.

Before the shared album can upload or show photos, add Row Level Security policies for your `photos` table and `couple-photos` bucket. Only allow the two email addresses you approve. Keep the bucket private.

To create an album account, invite the person from **Authentication → Users → Add user**. When they open the invitation link, the site now shows a form for choosing their password before they sign in.

The optional files in `images/` are static and public to anyone who can open the site. Keep private couple photos in Supabase instead.
