import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query/react";
import type { RundownItem, ScriptsPersistState } from "../types";

const KEY = "pair-wise-yf-46/rundown";
const SCRIPTS_KEY = "pair-wise-yf-46/scripts";

export const rundownApi = createApi({
  reducerPath: "rundownApi",
  baseQuery: fakeBaseQuery(),
  tagTypes: ["Rundown", "Scripts"],
  endpoints: (builder) => ({
    getRundown: builder.query<RundownItem[], void>({
      queryFn: async () => {
        const raw = localStorage.getItem(KEY);
        return { data: raw ? JSON.parse(raw) as RundownItem[] : [] };
      },
      providesTags: ["Rundown"]
    }),
    saveRundown: builder.mutation<{ ok: true }, RundownItem[]>({
      queryFn: async (items) => {
        localStorage.setItem(KEY, JSON.stringify(items));
        return { data: { ok: true } };
      },
      invalidatesTags: ["Rundown"]
    }),
    getScripts: builder.query<ScriptsPersistState | null, void>({
      queryFn: async () => {
        const raw = localStorage.getItem(SCRIPTS_KEY);
        return { data: raw ? JSON.parse(raw) as ScriptsPersistState : null };
      },
      providesTags: ["Scripts"]
    }),
    saveScripts: builder.mutation<{ ok: true }, ScriptsPersistState>({
      queryFn: async (state) => {
        localStorage.setItem(SCRIPTS_KEY, JSON.stringify(state));
        return { data: { ok: true } };
      },
      invalidatesTags: ["Scripts"]
    })
  })
});

export const { useGetRundownQuery, useSaveRundownMutation, useGetScriptsQuery, useSaveScriptsMutation } = rundownApi;
