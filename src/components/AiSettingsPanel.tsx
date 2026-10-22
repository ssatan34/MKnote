import { useState } from "react";
import type { AiConfig, AppConfig, NoteClassificationConfig } from "../types";
import { AiConfigPanel } from "./AiConfigPanel";
import { NoteClassificationSettingsPanel } from "./NoteClassificationSettingsPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

interface Props {
  config: AppConfig;
  onAiSave: (settings: AiConfig) => void | Promise<void>;
  onClassificationSave: (settings: NoteClassificationConfig) => Promise<void>;
}

export function AiSettingsPanel({ config, onAiSave, onClassificationSave }: Props) {
  const [tab, setTab] = useState("assistant");
  return (
    <section className="settings-card ai-settings">
      <div className="settings-card-head">
        <div><strong>AI 配置</strong><span>文本助手与笔记归类分别配置</span></div>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="note-upload-tabs" aria-label="AI 功能设置">
          <TabsTrigger value="assistant">AI 助手</TabsTrigger>
          <TabsTrigger value="jev">Jev 自动归类</TabsTrigger>
        </TabsList>
        <TabsContent value="assistant" forceMount hidden={tab !== "assistant"}>
          <AiConfigPanel embedded config={config} onSave={onAiSave} />
        </TabsContent>
        <TabsContent value="jev" forceMount hidden={tab !== "jev"}>
          <NoteClassificationSettingsPanel config={config} onSave={onClassificationSave} />
        </TabsContent>
      </Tabs>
    </section>
  );
}
