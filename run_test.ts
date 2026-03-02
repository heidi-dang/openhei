import { test, expect } from "bun:test";
import { useSettings } from "@/context/settings";
import { useLocal } from "@/context/local";

test("check mocks", async () => {
    console.log(useSettings().general.chatMode());
    console.log(useLocal().agent?.current());
})
