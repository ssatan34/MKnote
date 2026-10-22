import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { ChevronDown, Search } from "lucide-react";

const THEME_MODES = ["light", "dark"] as const;

/**
 * 独立 UI 预览页：?ui-playground=1
 */
export function UiPlayground() {
  const [mode, setMode] = useState<(typeof THEME_MODES)[number]>("light");
  const [query, setQuery] = useState("");
  const [showPinned, setShowPinned] = useState(true);
  const [loadingDemo, setLoadingDemo] = useState(false);

  const runLoadingDemo = () => {
    setLoadingDemo(true);
    window.setTimeout(() => setLoadingDemo(false), 1200);
  };

  return (
    <TooltipProvider>
      <div
        className="min-h-screen bg-background p-6 text-foreground"
        data-theme={mode}
        data-light-theme="mknote"
        data-dark-theme="mknote"
        data-accent-skin="mknote"
      >
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="ui-text-display text-2xl">MKnote UI Playground</h1>
            <p className="ui-text-caption mt-1">第 2 阶段核心组件预览</p>
          </div>
          <div className="flex gap-2">
            {THEME_MODES.map((item) => (
              <Button
                key={item}
                size="sm"
                variant={mode === item ? "default" : "outline"}
                onClick={() => setMode(item)}
              >
                {item === "light" ? "浅色" : "深色"}
              </Button>
            ))}
          </div>
        </header>

        <Tabs defaultValue="forms" className="mb-8">
          <TabsList>
            <TabsTrigger value="forms">表单</TabsTrigger>
            <TabsTrigger value="overlays">浮层</TabsTrigger>
            <TabsTrigger value="actions">操作</TabsTrigger>
          </TabsList>

          <TabsContent value="forms" className="grid gap-4 md:grid-cols-2">
            <Card title="Button">
              <div className="flex flex-wrap gap-2">
                <Button>Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="destructive">Destructive</Button>
                <Button size="icon" variant="outline" aria-label="搜索">
                  <Search />
                </Button>
                <Button loading={loadingDemo} onClick={runLoadingDemo}>
                  {loadingDemo ? "加载中" : "Loading 演示"}
                </Button>
                <Button disabled>Disabled</Button>
              </div>
            </Card>

            <Card title="Input / Textarea">
              <div className="space-y-3">
                <Input placeholder="默认输入框" />
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="带图标搜索框"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="playground-note">笔记内容</Label>
                  <Textarea id="playground-note" placeholder="多行输入…" rows={4} />
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="overlays" className="grid gap-4 md:grid-cols-2">
            <Card title="Dialog">
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline">打开 Dialog</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>示例对话框</DialogTitle>
                    <DialogDescription>用于设置、表单等需要聚焦的交互。</DialogDescription>
                  </DialogHeader>
                  <Input placeholder="对话框内输入" />
                  <DialogFooter>
                    <Button variant="outline">取消</Button>
                    <Button>确认</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </Card>

            <Card title="AlertDialog">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">打开 AlertDialog</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>确认删除？</AlertDialogTitle>
                    <AlertDialogDescription>
                      此操作不可撤销，将永久删除该便签。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction>删除</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </Card>

            <Card title="Popover">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline">打开 Popover</Button>
                </PopoverTrigger>
                <PopoverContent>
                  <p className="ui-text-body">轻量浮层，适合快捷操作与说明。</p>
                </PopoverContent>
              </Popover>
            </Card>

            <Card title="Tooltip">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost">悬停查看 Tooltip</Button>
                </TooltipTrigger>
                <TooltipContent>快捷键提示、图标说明</TooltipContent>
              </Tooltip>
            </Card>
          </TabsContent>

          <TabsContent value="actions">
            <Card title="DropdownMenu">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    更多操作
                    <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuLabel>笔记操作</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>重命名</DropdownMenuItem>
                  <DropdownMenuItem>复制路径</DropdownMenuItem>
                  <DropdownMenuCheckboxItem
                    checked={showPinned}
                    onCheckedChange={(v) => setShowPinned(v === true)}
                  >
                    置顶窗口
                  </DropdownMenuCheckboxItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </Card>
          </TabsContent>
        </Tabs>

        <section className="rounded-lg border border-dashed border-border p-4">
          <h2 className="ui-text-display mb-2 text-base">试点迁移</h2>
          <p className="ui-text-caption">
            主应用已将「全局快捷键」面板迁移到 Dialog + Input + Button（见状态栏热键按钮）。
          </p>
        </section>
      </div>
    </TooltipProvider>
  );
}

function Card({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm",
        className,
      )}
    >
      <h2 className="ui-text-display mb-3 text-base">{title}</h2>
      {children}
    </div>
  );
}
