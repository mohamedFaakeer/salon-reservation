import type { DataSource } from "typeorm";
import { AppController } from "./app.controller";
import { isApiError } from "@salon/shared";

describe("AppController.health", () => {
  it("reports ok when the database answers", async () => {
    const dataSource = { query: vi.fn(async () => [{ "?column?": 1 }]) } as unknown as DataSource;
    const controller = new AppController(dataSource);

    const result = await controller.health();

    expect(result.status).toBe("ok");
    expect(dataSource.query).toHaveBeenCalledWith("SELECT 1");
  });

  it("throws a 503 DATABASE_UNAVAILABLE when the database query rejects", async () => {
    const dataSource = { query: vi.fn(async () => { throw new Error("connection refused"); }) } as unknown as DataSource;
    const controller = new AppController(dataSource);

    await expect(controller.health()).rejects.toSatisfy((err: unknown) => {
      return isApiError(err) && err.statusCode === 503 && err.code === "DATABASE_UNAVAILABLE";
    });
  });

  it("throws a 503 when the database query hangs past the health-check's own timeout", async () => {
    vi.useFakeTimers();
    const dataSource = { query: vi.fn(() => new Promise(() => {})) } as unknown as DataSource;
    const controller = new AppController(dataSource);

    const pending = controller.health();
    const assertion = expect(pending).rejects.toSatisfy((err: unknown) => {
      return isApiError(err) && err.statusCode === 503 && err.code === "DATABASE_UNAVAILABLE";
    });
    await vi.advanceTimersByTimeAsync(3_000);
    await assertion;

    vi.useRealTimers();
  });
});
