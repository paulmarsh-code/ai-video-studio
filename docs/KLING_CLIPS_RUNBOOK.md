# Making the clips in Kling (Claude's side, D123, D125, D126)

The app has no Kling key. When Paul presses Create on "Make the clips", the app writes each clip to
`data/kling_jobs.json` on his computer (`C:\Users\paul.marsh\ai-video-studio\data\kling_jobs.json`).
When he says "make the clips":

1. **Read the jobs.** Stage the jobs file through the device bridge. The clips to make are the jobs with status `ready`.
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
   - commit it to `data/clips/<scene>_clip<N>_panels<a-b>.mp4` on Paul's computer;
   - set `status` to `done` with `videoUrl` and `localFile` (the file name);
   - or, if it failed, set `failed` with Kling's error.
   - Commit the jobs file, then send Paul the clip and look at it against its pictures, shot by shot.
