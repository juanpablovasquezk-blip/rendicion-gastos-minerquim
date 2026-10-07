/**
 * Utilidad de compresión y optimización de imágenes en el cliente (Browser).
 * Reduce fotos pesadas de celulares (5MB - 15MB) a ~200KB - 400KB manteniendo
 * perfecta legibilidad del texto, RUT, folios y montos para OCR y almacenamiento.
 */

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0.1 a 1.0
  targetMimeType?: "image/jpeg" | "image/webp";
}

export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<File> {
  // Si no es una imagen (ej: PDF, XML), devolver el archivo original intacto
  if (!file.type.startsWith("image/")) {
    return file;
  }

  // Si ya es muy liviana (ej: menor a 400KB), no es necesario comprimir
  if (file.size <= 400 * 1024 && !file.type.includes("heic")) {
    return file;
  }

  const {
    maxWidth = 1920,
    maxHeight = 1920,
    quality = 0.82,
    targetMimeType = "image/jpeg",
  } = options;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const img = new window.Image();

      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Redimensionar manteniendo proporción si excede dimensiones máximas
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          // Si falla el contexto, devolver archivo original
          return resolve(file);
        }

        // Fondo blanco para imágenes transparentes convertidas a JPEG
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, width, height);

        // Suavizado de imagen de alta calidad
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              return resolve(file);
            }

            // Cambiar extensión a .jpg si se convirtió a JPEG
            const baseName = file.name.replace(/\.[^/.]+$/, "");
            const newFileName = `${baseName}.jpg`;

            const compressedFile = new File([blob], newFileName, {
              type: targetMimeType,
              lastModified: Date.now(),
            });

            console.log(
              `⚡ [Compresión de Imagen] Original: ${(file.size / 1024).toFixed(0)} KB ➔ Optimizado: ${(compressedFile.size / 1024).toFixed(0)} KB`
            );

            resolve(compressedFile);
          },
          targetMimeType,
          quality
        );
      };

      img.onerror = () => resolve(file);
      img.src = event.target?.result as string;
    };

    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}
