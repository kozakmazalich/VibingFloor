// Verify the arena thumbnails exist and load correctly.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(2500);
  const out = [];
  const imgs = [...document.querySelectorAll(".map-thumb")];
  out.push(`map thumbs: ${imgs.length}`);
  let allLoaded = true;
  for (const img of imgs) {
    if (!img.complete || img.naturalWidth === 0) allLoaded = false;
    out.push(`${img.src.split("/").pop()} ${img.naturalWidth}x${img.naturalHeight}`);
  }
  out.push(allLoaded ? "OK: all arena thumbs loaded" : "FAIL: some thumbs missing");
  return out.join("\n");
})();
