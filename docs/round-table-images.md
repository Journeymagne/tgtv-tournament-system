# Team round killzone images

Each of the three table/layout selections in Generate first/next round has an
optional PNG, JPEG or WebP upload and a preview. The browser resizes the entire
image to exactly 200 pixels on its shorter side, preserving proportions and
transparency, and saves PNG. Smaller source images are enlarged to the same
size. Uploads are limited to 20 MiB before resizing and 1 MiB afterward.

Changing terrain or deployment clears that table's draft image. Removing an
image asks for confirmation. Asynchronous file reads cannot restore an image
after removal or replacement, and saving waits until processing finishes.

Migration 025 stores images separately in `tournament_table_images`. Identical
images are deduplicated within a tournament. Round table snapshots reference
the image ID; game mission snapshots retain the same reference. Later rounds
inherit existing images when retaining the table setup. Replacing or clearing
an image never modifies earlier rounds. Deleting a tournament removes its
images through the foreign key.

Images appear beside available tables during captain pairing, alongside assigned
games in match previews, and on the game details page. They load through
`/api/tournament-table-images/:id`, keeping binary data out of polling responses.
Draft tournament images require an administrator; published tournament images
follow public tournament access.

Validation: client resize/format/size tests, API image validation and ownership,
round persistence/history for both TTS and IRL, game image references, and browser
upload of a 1200×800 PNG producing a 300×200 preview.
