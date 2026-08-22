import { Injectable } from "@nestjs/common";
// ConfigService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ConfigService } from "@nestjs/config";
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import { ApiError } from "@salon/shared";

/**
 * Thin wrapper around the Cloudinary SDK. The one place `logoUrl` values are
 * minted — a real, public HTTPS URL, never a data: URI, since the invoice
 * HTML email embeds it as a plain `<img src>` and several mail clients strip
 * inline data: images.
 */
@Injectable()
export class CloudinaryService {
  private configured = false;

  constructor(config: ConfigService) {
    const cloudName = config.get<string>("CLOUDINARY_CLOUD_NAME");
    const apiKey = config.get<string>("CLOUDINARY_API_KEY");
    const apiSecret = config.get<string>("CLOUDINARY_API_SECRET");
    if (cloudName && apiKey && apiSecret) {
      cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
      this.configured = true;
    }
  }

  /**
   * Uploads a pre-validated image buffer as a salon logo. `c_pad` with an
   * auto-detected background pads the stored master onto a square canvas
   * rather than cropping content away — the "safe margin" the logo carries
   * into every surface that renders it starts here.
   */
  async uploadLogo(buffer: Buffer, folder: string): Promise<string> {
    if (!this.configured) {
      throw new ApiError({
        statusCode: 503,
        code: "LOGO_UPLOAD_NOT_CONFIGURED",
        message: "Logo uploads aren't configured for this environment.",
      });
    }

    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          transformation: [{ width: 1024, height: 1024, crop: "pad", background: "auto" }, { fetch_format: "auto", quality: "auto" }],
          overwrite: true,
        },
        (error, uploadResult) => {
          if (error || !uploadResult) {
            reject(error ?? new Error("Cloudinary returned no result."));
            return;
          }
          resolve(uploadResult);
        },
      );
      stream.end(buffer);
    }).catch((error: unknown) => {
      throw new ApiError({
        statusCode: 502,
        code: "LOGO_UPLOAD_FAILED",
        message: "Couldn't upload the logo right now. Please try again.",
        details: { cause: error instanceof Error ? error.message : String(error) },
      });
    });

    return result.secure_url;
  }
}
