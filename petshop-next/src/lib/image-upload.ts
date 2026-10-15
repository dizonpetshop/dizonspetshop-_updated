export async function uploadedImage(form: FormData, field: string, existing: string | null = null) {
  const upload = form.get(field);
  if (!(upload instanceof File) || !upload.size) return existing;
  if (upload.size > 1_500_000) throw new Error("Images must be smaller than 1.5 MB.");
  const bytes = Buffer.from(await upload.arrayBuffer());
  const jpeg = upload.type === "image/jpeg" && bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = upload.type === "image/png" && bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = upload.type === "image/webp" && bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!jpeg && !png && !webp) throw new Error("Upload a valid JPG, PNG, or WebP image.");
  return `data:${upload.type};base64,${bytes.toString("base64")}`;
}
