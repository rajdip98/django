================================================================
  HOW TO PUT THIS WEBSITE ONLINE
================================================================

THE ONE FILE YOU MUST NOT MISS:  index.html
-------------------------------------------
If your domain shows "Page not found", it means index.html is not in the
folder. That single file is the home page. Everything else can be missing and
the site still works — but without index.html the bare address has nothing to
open.


FIRST: OPEN  yourdomain.com/check.html
--------------------------------------
After uploading, open that address. It tests your own installation and names
exactly what is missing. Use it before anything else on this page.


GOOD NEWS: THE PAGES CARRY THEIR OWN DESIGN
-------------------------------------------
Each .html file now has the styling built into it. If the "assets" folder
fails to upload, the pages STILL look correct — you only lose the photographs.
So if you are struggling with the upload, get the .html files up first; they
are complete on their own.


IF EVERY PAGE IS BLANK OR SHOWS "500"
-------------------------------------
DELETE THE FILE NAMED  .htaccess

The website works perfectly without it; you only lose the custom 404 page.
(A single line in that file which your server does not understand makes Apache
refuse EVERY page with error 500, and a 500 with no message looks exactly like
a blank white website.)


WHAT WENT WRONG BEFORE
----------------------
The blank white page you saw was the React version of the site. React has to
be COMPILED before a browser can show it — its index.html only contains a link
to a source file, and a normal web host has nothing to compile it with. So the
browser downloaded a page with no content in it and showed you white.

This folder is different. Every page here is a finished .html file. There is
nothing to compile, nothing to install, and no Node.js needed. Upload it and it
works.


HOW TO UPLOAD (cPanel / Hostinger / GoDaddy / any normal host)
--------------------------------------------------------------
1. Open your hosting control panel and go to the File Manager.

2. Open the folder named  public_html   (some hosts call it htdocs or www).

3. Delete whatever is in there from the last attempt.

4. Upload EVERYTHING INSIDE this "website" folder — not the folder itself.
   When you are done, public_html should directly contain:

        index.html        <- the home page. Check this one arrived.
        index.htm         <- a spare copy, for hosts that look for .htm
        about.html
        committee.html
        ... (the other pages)
        check.html        <- open this to test the upload
        .htaccess
        assets/           <- photographs (optional; pages work without it)

   TIP: if your File Manager struggles with the folder, upload the .html files
   first. They are self-contained and the site will already work.

   If you see  public_html/website/index.html  you have gone one level too
   deep. Move the files up one level.

5. Visit your domain. The home page appears immediately.


COMMON MISTAKES
---------------
* Uploading the ZIP without extracting it   -> you get a blank page or a
                                               download prompt. Extract first.
* Uploading the "website" folder itself     -> your site would be at
                                               yourdomain.com/website/ instead
                                               of yourdomain.com/
* Missing the "assets" folder               -> pages still look correct (the
                                               design is inside each file); only
                                               the photographs are missing.
* Missing index.html                        -> the bare domain shows
                                               "Page not found". Upload it.
* .htaccess not uploaded                    -> the site still works; you just
                                               lose the custom 404 page.
  (.htaccess starts with a dot, so turn on "show hidden files" in File Manager.)
* Old page still appearing                  -> your browser cached it.
                                               Press Ctrl+F5, or open the site
                                               in a private/incognito window.
* Everything is 500 / blank                 -> delete .htaccess (see above).


CHANGING THE CONTENT
--------------------
The text is written directly in the .html files. Open any file in a text
editor, change the words between the tags, and re-upload that one file.

The club name, address, phone and e-mail appear on every page. To change them
everywhere, use your editor's "find in all files" and replace:

      Krishnanagar Youth & Cultural Club
      14 Rabindra Sarani, Krishnanagar, Nadia — 741101
      +91 33 2555 0100
      office@example.org

PHOTOGRAPHS
-----------
The pictures in assets/img/ are coloured placeholders. Replace them with real
photographs using the SAME FILE NAMES (gallery-1.svg ... gallery-6.svg), or use
your own names and update the src="..." in gallery.html and index.html.
JPG and PNG both work — for example  src="assets/img/festival.jpg".

DOCUMENTS FOR THE DOWNLOADS PAGE
--------------------------------
Create a folder  assets/files/  and put your PDFs in it. Then in
downloads.html, change the last column of a row from the grey "available at
the office" text to a link:

      <a class="btn btn-sm btn-ghost" href="assets/files/annual-report.pdf">⬇ Download</a>


THE ADMIN PANELS
----------------
The "Admin Panel" and "Super Admin" links in the header and footer point to:

      /adminpanel/login/
      /superadminpanel/login/

Those pages are served by the BACKEND (the Django application in the backend
folder). They only work if you are running that backend on the same domain.

On a plain web host with no backend, those two links will show your host's
404 page — that is expected, not a fault in this website. See backend/README.md
for how to run them, and frontend/README.md if the backend lives on a
different domain.


THE CONTACT FORM
----------------
With the backend running, the form saves the enquiry and shows a confirmation.
Without it, the form checks what the visitor typed and then offers a
"Send it by e-mail instead" link with their message already filled in — so no
one is left staring at an error.
