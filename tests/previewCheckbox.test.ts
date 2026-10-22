import assert from "node:assert/strict";
import test from "node:test";
import { syncTaskCheckboxAttribute } from "../src/utils/taskCheckbox.ts";

function createFakeCheckbox(checked: boolean) {
  const attributes = new Set<string>();
  return {
    checked,
    setAttribute(name: string) {
      attributes.add(name);
    },
    removeAttribute(name: string) {
      attributes.delete(name);
    },
    toggleAttribute(name: string, force?: boolean) {
      const nextValue = force === undefined ? !attributes.has(name) : force;
      if (nextValue) attributes.add(name);
      else attributes.delete(name);
      return nextValue;
    },
    hasAttribute(name: string) {
      return attributes.has(name);
    },
  } as unknown as HTMLInputElement;
}

test("预览复选框勾选状态会同步到 HTML 属性，确保回写 Markdown 时保留状态", () => {
  const checkbox = createFakeCheckbox(true);

  syncTaskCheckboxAttribute(checkbox);

  assert.equal(checkbox.hasAttribute("checked"), true);
});

test("取消勾选时会移除 HTML checked 属性", () => {
  const checkbox = createFakeCheckbox(false);
  checkbox.setAttribute("checked", "");

  syncTaskCheckboxAttribute(checkbox);

  assert.equal(checkbox.hasAttribute("checked"), false);
});
