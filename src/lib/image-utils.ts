export async function compressImage(
  file: File,
  maxWidth = 400,
  maxHeight = 400,
  quality = 0.8,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve(dataUrl);
      };

      img.onerror = (error) => reject(error);

      if (event.target?.result && typeof event.target.result === "string") {
        img.src = event.target.result;
      } else {
        reject(new Error("Failed to read file"));
      }
    };

    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

export interface CompressedImageResult {
  url: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  width: number;
  height: number;
}

/**
 * Compresses an attachment image (e.g. screenshot or mockup) preserving high legibility
 * (up to 1600x1600px, quality 0.85).
 */
export async function compressAttachmentImage(
  file: File,
  maxWidth = 1600,
  maxHeight = 1600,
  quality = 0.85,
): Promise<CompressedImageResult> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("O arquivo selecionado não é uma imagem válida."));
      return;
    }

    const reader = new FileReader();

    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;

        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(
            new Error(
              "Falha ao inicializar o contexto gráfico para processar a imagem.",
            ),
          );
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        const outputType =
          file.type === "image/png" ? "image/png" : "image/jpeg";
        const dataUrl = canvas.toDataURL(outputType, quality);

        const base64Length = dataUrl.length - (dataUrl.indexOf(",") + 1);
        const approxBytes = Math.round((base64Length * 3) / 4);

        resolve({
          url: dataUrl,
          fileName: file.name,
          fileSize: approxBytes,
          contentType: outputType,
          width,
          height,
        });
      };

      img.onerror = () => reject(new Error("Falha ao carregar a imagem."));

      if (event.target?.result && typeof event.target.result === "string") {
        img.src = event.target.result;
      } else {
        reject(new Error("Falha ao ler os dados da imagem."));
      }
    };

    reader.onerror = () => reject(new Error("Falha ao ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

/** Formats byte size into human-readable string (e.g. 142 KB, 1.2 MB) */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
