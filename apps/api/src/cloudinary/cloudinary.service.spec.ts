import type { ConfigService } from "@nestjs/config";
import { v2 as cloudinary, type UploadApiErrorResponse, type UploadApiResponse } from "cloudinary";
import { CloudinaryService } from "./cloudinary.service";

vi.mock("cloudinary", () => {
  const uploadStream = vi.fn();
  return {
    v2: {
      config: vi.fn(),
      uploader: { upload_stream: uploadStream },
    },
  };
});

function fakeConfig(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

type UploadStreamCallback = (error: UploadApiErrorResponse | undefined, result: UploadApiResponse | undefined) => void;

/** `mockImplementation` needs one concrete shape to type-check against an overloaded SDK signature. */
function fakeUploadStream(handler: (callback: UploadStreamCallback) => void): typeof cloudinary.uploader.upload_stream {
  return ((_opts: unknown, callback: UploadStreamCallback) => {
    handler(callback);
    return { end: vi.fn() };
  }) as unknown as typeof cloudinary.uploader.upload_stream;
}

describe("CloudinaryService", () => {
  beforeEach(() => {
    vi.mocked(cloudinary.uploader.upload_stream).mockReset();
  });

  it("refuses to upload when the env vars are missing, without ever calling Cloudinary", async () => {
    const service = new CloudinaryService(fakeConfig({}));
    await expect(service.uploadLogo(Buffer.from("x"), "salon-logos/eagle")).rejects.toMatchObject({
      statusCode: 503,
      code: "LOGO_UPLOAD_NOT_CONFIGURED",
    });
    expect(cloudinary.uploader.upload_stream).not.toHaveBeenCalled();
  });

  it("returns the secure_url on a successful upload", async () => {
    vi.mocked(cloudinary.uploader.upload_stream).mockImplementation(
      fakeUploadStream((callback) =>
        callback(undefined, { secure_url: "https://res.cloudinary.com/demo/logo.png" } as UploadApiResponse),
      ),
    );

    const service = new CloudinaryService(
      fakeConfig({ CLOUDINARY_CLOUD_NAME: "demo", CLOUDINARY_API_KEY: "key", CLOUDINARY_API_SECRET: "secret" }),
    );
    const url = await service.uploadLogo(Buffer.from("x"), "salon-logos/eagle");
    expect(url).toBe("https://res.cloudinary.com/demo/logo.png");
  });

  it("wraps a Cloudinary-side failure as LOGO_UPLOAD_FAILED", async () => {
    vi.mocked(cloudinary.uploader.upload_stream).mockImplementation(
      fakeUploadStream((callback) => callback(new Error("network blip") as UploadApiErrorResponse, undefined)),
    );

    const service = new CloudinaryService(
      fakeConfig({ CLOUDINARY_CLOUD_NAME: "demo", CLOUDINARY_API_KEY: "key", CLOUDINARY_API_SECRET: "secret" }),
    );
    await expect(service.uploadLogo(Buffer.from("x"), "salon-logos/eagle")).rejects.toMatchObject({
      statusCode: 502,
      code: "LOGO_UPLOAD_FAILED",
    });
  });

  it("uploads a product image under its own error codes, distinct from the logo path", async () => {
    const service = new CloudinaryService(fakeConfig({}));
    await expect(service.uploadProductImage(Buffer.from("x"), "product-images/eagle")).rejects.toMatchObject({
      statusCode: 503,
      code: "PRODUCT_IMAGE_UPLOAD_NOT_CONFIGURED",
    });

    vi.mocked(cloudinary.uploader.upload_stream).mockImplementation(
      fakeUploadStream((callback) =>
        callback(undefined, { secure_url: "https://res.cloudinary.com/demo/product.png" } as UploadApiResponse),
      ),
    );
    const configured = new CloudinaryService(
      fakeConfig({ CLOUDINARY_CLOUD_NAME: "demo", CLOUDINARY_API_KEY: "key", CLOUDINARY_API_SECRET: "secret" }),
    );
    const url = await configured.uploadProductImage(Buffer.from("x"), "product-images/eagle");
    expect(url).toBe("https://res.cloudinary.com/demo/product.png");
  });
});
