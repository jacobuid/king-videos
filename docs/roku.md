# KINGFLIX on Roku


Roku is a viewing-only app. Device linking/unlinking is its only configuration. Switch Profile chooses an existing profile; it does not create, edit or manage profiles. Profile management, video editing and bulk editing belong on the website and must never be exposed in the Roku UI or allowed through Roku device credentials.
The first version is a private SceneGraph/BrightScript app installed through Roku Developer Mode. It shares the web catalog, profile access restrictions, captions, favorites, and playback progress. A Roku hardware test is still required; compiler validation does not verify playback or the TV layout.

## Build

From the repository root:

```powershell
npm ci
npm run build:roku
npm run test:roku
```

The build reads the public `VITE_API_URL` from the repository `.env`. Optionally set `ROKU_WEB_URL` to override `https://jacobuid.github.io/king-videos/`. The generated ZIP is `apps/roku/dist/kingflix-roku.zip`. Credentials from `.env` are never copied into the package. Generated configuration, artwork, and packages are ignored by Git. GitHub Actions also builds a downloadable `kingflix-roku` artifact after pushes.

Push the web and API changes before linking the TV. The existing API workflow applies `0014_roku_devices.sql` and deploys the pairing routes; the web workflow deploys the Link Roku screen.

## Install and link

1. On the Roku remote press Home three times, Up twice, Right, Left, Right, Left, Right. Enable Developer Mode and set a developer web-server password. Roku may restart.
2. Find the Roku's IP in Settings → Network → About. On a computer on the same network, open `http://ROKU_IP` and sign in as `rokudev` with that password.
3. Upload `apps/roku/dist/kingflix-roku.zip` and choose Install.
4. The TV displays an eight-character code and a website address. Open that address, sign in to KINGFLIX, and choose Link Roku. Alternatively, use the Link Roku button on the website's profile picker.
5. Choose a profile on the TV and enter its PIN when required.

The code lasts ten minutes. The linked device lasts ninety days; profile unlocks last twenty-four hours. The website's Link Roku screen lists linked devices and lets you unlink them. Unlink Roku on the TV also revokes the server-side device token.

## Remote controls and behavior

Browsing pages share one MainMenu component, including the proportional KINGFLIX logo, yellow divider, icons, active-page highlight, and Link/Unlink action. Movies, Shows, Series, Home Videos, Home, Search, and title/episode views use this same sidebar. Profile selection, pairing, loading, and full-screen video hide it. Home-videos-only profiles receive the restricted menu. Left at the first card or Back from browsing focuses the menu; Right returns to the current page. Search passes focus to this same menu from its keyboard, Recent pills, genre shortcuts, and cards.

- Up/Down: change shelf or menu entry. Left/Right: move between cards; Left at the first card opens the menu, Right returns to cards.
- OK: select, play, or enter a profile PIN. Back: return to the previous shelf and card, or stop playback.
- Roku's standard video UI handles pause, fast-forward, rewind, and the `*` captions menu.
- Continue Watching resumes the selected episode. Episodes watched at least 98% advance to the next incomplete episode, including across seasons.
- Featured Presentation selects an unwatched unblocked movie, falling back to any unblocked movie.
- Home displays Featured Presentation in a large detail-style hero with Play and Details actions above Continue Watching, My List, and Movies shelves. Focusing a shelf card updates the hero to that title. Down from the hero opens the shelves; Up from the first shelf returns to the hero actions. The featured choice is stable during progress refreshes and is cleared when switching profiles.
- Movies and Shows use a four-column grid containing the full profile-visible list, with two rows visible at a time and vertical scrolling to the end. No Latest Added shelf is shown. The focused card updates the artwork, title, description, and metadata above; OK opens its detail page, and Back from details restores the grid selection. The shared left menu remains unchanged.
- Selecting a movie, show, episode, or Continue Watching card opens the detail page with large proportional artwork, a gold title, available metadata/genres, Play/Continue, and genre-matched similar titles from the current profile's catalog. Movies have a My List action; shows have an Episodes action and resume the most recently watched incomplete episode. Optional credits are displayed only when supplied by the catalog. Down moves from actions to similar titles, Up returns, Left opens the unchanged shared menu, and Back restores the originating page or previous detail view.
- TV opens an ordered episode list. Series opens the manually curated collections from the website.
- Search is a full page with a gold search field, an embedded alphabet/number/accent keyboard, four recent queries per profile, genre shortcuts, and six visible result cards. Left/Right scroll through all matching cards. Results update while typing and include series when an episode title matches. The initial Explore KINGFLIX row uses the available catalog, not popularity analytics.
- Select a Recent pill with OK to fill the search field and refresh the results. Queries are remembered locally for the current profile when leaving the keyboard for shortcuts/results or selecting a title. Switching profiles clears the current query and loads that profile's recent searches.
- Phone typing uses the same embedded Roku DynamicCustomKeyboard text field; there is no native keyboard popup. With the search keyboard focused, open the keyboard in the Roku mobile remote and type. On devices requiring it, enable Settings > System > Advanced system settings > Control by mobile apps. Verify typing, spaces, accents, deletion, and switching back to directional navigation on hardware.
- Home-videos-only profiles retain the same server-enforced restrictions as the website.

The first version needs a current Roku OS with the Standard dialog framework and WebP image support. This is a sideload build, not a submitted Streaming Store release. A store release needs a separate review of Roku's authentication and certification requirements.

## Verify on hardware

Check linking, wrong/correct PINs, remembered profile access, a movie, an episode, captions, seeking, pause/Back progress, reopening the same episode, the 98% next-episode rule, collection navigation, and a home-videos-only profile. Also test device revocation from the website and relinking.

Search hardware checks: move among sidebar, Recent pills, keyboard, genres, and result cards; enter and clear a query; select a Recent pill; open a movie and return with Back; open a show's episodes and return; scroll past the sixth result; confirm an empty search result; switch profiles and check history isolation; type using the Roku mobile keyboard. Compiler checks do not verify mobile keyboard discovery or actual TV rendering. The embedded keyboard uses Roku's [custom layout API](https://developer.roku.com/dev/docs/dynamic-custom-keyboard) and [key definition format](https://developer.roku.com/dev/docs/key-definition-file).

For debug output, run `node scripts/roku-console.mjs ROKU_IP` while the app runs. This reads the Roku's Developer Mode console on port 8085; it does not upload or install anything.

## Implementation and checks

Network requests and registry access run in Task nodes. The render thread only builds and updates the interface. Device secrets are random, stored only in the Roku registry, and hashed in D1. They cannot manage profiles, change PINs, manage videos, or authorize other devices. A signed-in web session approves linking. Existing profile tokens and access checks remain required for catalog and playback routes.

Roku requests the existing signed video URLs. The API converts signed private WebVTT sidecars to SRT on request, without changing the stored subtitle files or browser playback.

Sources: [Roku SceneGraph](https://developer.roku.com/dev/docs/scenegraph), [Task threads](https://developer.roku.com/dev/docs/threads), [Video node](https://developer.roku.com/dev/docs/video), [caption metadata](https://developer.roku.com/dev/docs/content-metadata), [Developer Mode installation](https://developer.roku.com/dev/docs/developer-setup).

## Playback troubleshooting

Roku video links preserve the original HTTP byte range, including open-ended requests, instead of using the browser delivery limit of 16 MB. Push the API changes as well as installing the rebuilt app to enable this fix. The player uses Roku's built-in controls, logs state/error information without signed URLs, and returns to the title if playback makes no progress for sixty seconds. Back restores the app immediately rather than waiting for a stopped event. Temporary progress-save failures retain the latest pending position for retry.

A read-only B2 check of Rainbow Brite and the Star Stealer found H.264 Main level 3.1, 854 ? 480, 8-bit 4:2:0, stereo HE-AAC, and a valid thirty-second decode around ten minutes. Its MP4 metadata is at the end of the file rather than fast-start. These checks do not prove uninterrupted playback on the TV or certify the rest of the catalog.

The remote freeze observed during hardware testing was a BrightScript runtime exception: an uninitialized `progressSaving` value was used in a boolean expression, suspending the render thread in the micro debugger. Progress/poll flags are now explicitly initialized. Playback uses the standard focused Video node and its native controls, with only Back handled by the scene. The experimental PlayerVideo wrapper and custom remote controls have been removed.
