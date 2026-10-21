import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { debounce } from "./debounce";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test("calls once with the last arguments after the wait", () => {
  const fn = vi.fn();
  const debounced = debounce(fn, 300);

  debounced("a");
  debounced("b");
  vi.advanceTimersByTime(299);
  expect(fn).not.toHaveBeenCalled();

  vi.advanceTimersByTime(1);
  expect(fn).toHaveBeenCalledTimes(1);
  expect(fn).toHaveBeenCalledWith("b");
});

test("cancel drops a pending call", () => {
  const fn = vi.fn();
  const debounced = debounce(fn, 300);

  debounced();
  debounced.cancel();
  vi.advanceTimersByTime(1000);

  expect(fn).not.toHaveBeenCalled();
});
