# Making the clips in Kling (Claude's side, D123, D125, D126)

The app has no Kling key. When Paul presses Create on "Make the clips", the app writes each clip to
`data/kling_jobs.json` on his computer (`C:\Users\paul.marsh\ai-video-studio\data\kling_jobs.json`).
When he says "make the clips":

1. **Read the jobs.** Stage the jobs file through the device bridge. The clips to make are the jobs with status `ready`. A job with `change` is a new take Paul asked for in words: its `prompt` already says the change, so send the prompt as it is. Tell Paul it's a new take and its cost before sending.
2. **Tell Paul the cost first.** Give the total credits and check the balance (`query_membership_and_credits`). The balance the connection reports can be lower than the one in Kling's app. Kling jobs are charged: make only what he asked for.
3. **Upload the pictures** (free). For each picture without a `klingUrl`:
   - stage the file from its `path`;
   - call `file_upload` for a ticket;
   - POST it from the workspace: `curl -F ticket=… -F file=@…;type=image/png https://kling.ai/api/mcp/files`;
   - the reply's `data.url` is the `klingUrl`.
   - kling.ai is in Paul's Claude allowed websites (Settings → Capabilities → Allowed websites: `kling.ai`, `*.kling.ai`, `*.klingai.com`).
   - **Fallback, if the workspace can't reach kling.ai:** write the ticket into the picture's `upload` as `{ticket, url, expireAt}` and commit the file. The clips page, while open, uploads it from Paul's computer (D125). Then re-stage until `klingUrl` is set.
4. **Submit each clip.** Call `omni_ref_video` with:
   - model `kling-video-v4_0`;
   - arguments: `prompt` (the job's prompt), `elements` as a JSON array of `{id, bindName: name, type: "image"}`, `duration` (seconds), `aspect_ratio`, `resolution` 720p, `enable_audio` true, `prefer_multi_shots` true;
   - inputs: `image_N` for each picture's `klingUrl`, in order.
   - Then set the job's `status` to `sent` with its `generationId`, and commit the jobs file, with `expectedMtimeMs` from the stage.
5. **When it's made.** Poll `query_tasks`, then:
   - download the video (`urlWithoutWatermark`) in the workspace;
   - commit it to `data/clips/<scene>_clip<N>_panels<a-b>.mp4` on Paul's computer. For a new take of a clip (the job has `takes`, D139), add `_take<N>` with N = takes + 1, so the earlier take's file stays;
   - set `status` to `done` with `videoUrl` and `localFile` (the file name);
   - or, if it failed, set `failed` with Kling's error.
   - Commit the jobs file, then send Paul the clip and look at it against its pictures, shot by shot.

# Making the Elements (D127)

When Paul presses "Make … from the app's pictures" on the clips page, the app writes what to make to
`data/kling_element_requests.json` on his computer. When he says "make the elements":

1. **Read the requests.** Stage the requests file. Make the ones with status `ready`.
2. **Upload each picture.** For each request, stage its pictures from their `path` and upload them (`file_upload`, then `curl`), as for the clips.
3. **Make the Element.** Call `element_create` with:
   - `name` and `description` from the request;
   - `tags` from the request;
   - `resource`: `cover` is picture 1's `klingUrl`; `secondary` is the rest, as `{name: role, inputType: "URL", url}`.
4. **Write back.** Set `status` to `done` with the returned `id`, or `failed` with Kling's error.
5. **Refresh the list.** Call `element_list` and write `data/kling_elements.json` as `{updatedAt, elements: [{id, name}]}`, so the dropdowns show the new Elements.
6. **Commit both files.** The clips page links each made Element to its character, venue or prop the next time it opens (once; a later pick in the dropdown stands).
7. **Check the cost.** Creating Elements costs nothing, as far as we know: check the balance before and after the first run and tell Paul.
