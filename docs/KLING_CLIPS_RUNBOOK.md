# Making the clips in Kling (Claude's side, D123/D125)

The app has no Kling key. When Paul presses Create on "Make the clips", the app writes each clip to
`data/kling_jobs.json` on his computer (`C:\Users\paul.marsh\ai-video-studio\data\kling_jobs.json`).
When he says "make the clips":

1. **Read the jobs.** Stage the jobs file through the device bridge. The clips to make are the jobs with status `ready`.
2. **Tell Paul the cost first.** Give the total credits and check the balance (`query_membership_and_credits`). Kling jobs are charged: make only what he asked for.
3. **Get the upload tickets.** For each picture without a `klingUrl`, call Kling's `file_upload` with the picture's file name, type and size. It returns a ticket, `uploadUrl` and `expireAt`, valid about 10 minutes.
   - Write each one into the picture's `upload` as `{ticket, url, expireAt}`.
   - Commit the file back, with `expectedMtimeMs` from the stage.
   - Claude's workspace can't upload to kling.ai itself: the network allowlist refuses it with a 403.
4. **The page uploads.** The clips page must be open: it calls `/api/kling-uploads` every 5 seconds, uploads each picture with its ticket, and writes back `klingUrl`, or `uploadError`.
   - Re-stage the file until every picture has a `klingUrl`.
   - If a ticket ran out, get a new one.
5. **Submit each clip.** Call `omni_ref_video` with:
   - model `kling-video-v4_0`;
   - arguments: `prompt` (the job's prompt), `elements` as a JSON array of `{id, bindName: name, type: "image"}`, `duration` (seconds), `aspect_ratio`, `resolution` 720p, `enable_audio` true, `prefer_multi_shots` true;
   - inputs: `image_N` for each picture's `klingUrl`, in order.
6. **Write back and report.** Set the job's `status` to `sent` with its `generationId` and commit the file. Poll `query_tasks`.
   - When it finishes, set `status` to `done` with `videoUrl`, or `failed` with Kling's error, and commit again.
   - Send Paul the link. Kling's links last 24 hours.
