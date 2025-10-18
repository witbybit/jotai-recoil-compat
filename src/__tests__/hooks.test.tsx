import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { atom } from "../atom";
import { selector } from "../selector";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "../hooks";
import { RecoilRoot } from "../RecoilRoot";
import type { ReactNode } from "react";

const wrapper = ({ children }: { children: ReactNode }) => (
  <RecoilRoot>{children}</RecoilRoot>
);

describe("hooks", () => {
  describe("useRecoilState", () => {
    it("should read and update atom value", () => {
      const countAtom = atom({
        key: "count",
        default: 0,
      });

      const { result } = renderHook(() => useRecoilState(countAtom), {
        wrapper,
      });

      expect(result.current[0]).toBe(0);

      act(() => {
        result.current[1](1);
      });

      expect(result.current[0]).toBe(1);
    });

    it("should support updater function", () => {
      const countAtom = atom({
        key: "count2",
        default: 5,
      });

      const { result } = renderHook(() => useRecoilState(countAtom), {
        wrapper,
      });

      act(() => {
        result.current[1]((prev) => prev + 1);
      });

      expect(result.current[0]).toBe(6);
    });
  });

  describe("useRecoilValue", () => {
    it("should read atom value", () => {
      const nameAtom = atom({
        key: "name",
        default: "John",
      });

      const { result } = renderHook(() => useRecoilValue(nameAtom), {
        wrapper,
      });

      expect(result.current).toBe("John");
    });

    it("should read selector value", () => {
      const countAtom = atom({
        key: "countForSelector",
        default: 10,
      });

      const doubleSelector = selector({
        key: "double",
        get: ({ get }) => get(countAtom) * 2,
      });

      const { result } = renderHook(() => useRecoilValue(doubleSelector), {
        wrapper,
      });

      expect(result.current).toBe(20);
    });
  });

  describe("useSetRecoilState", () => {
    it("should update atom value without reading it", () => {
      const valueAtom = atom({
        key: "value",
        default: "initial",
      });

      const { result } = renderHook(
        () => ({
          setter: useSetRecoilState(valueAtom),
          value: useRecoilValue(valueAtom),
        }),
        { wrapper },
      );

      expect(result.current.value).toBe("initial");

      act(() => {
        result.current.setter("updated");
      });

      expect(result.current.value).toBe("updated");
    });
  });
});
