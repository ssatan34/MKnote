export interface VisualImagePersistenceFixture {
  id: string;
  title: string;
  markdown: string;
  imageMarkdown: string;
  safe: boolean;
  expectedImage?: {
    src: string;
    alt: string;
    title: string;
    sourceKind: string;
    localRel: string;
    originalLocalRel: string;
    hostedUrl: string;
    width: string;
    doodledUrl: string;
  };
}

function safeFixture(
  id: string,
  title: string,
  imageMarkdown: string,
  expectedImage: VisualImagePersistenceFixture["expectedImage"],
): VisualImagePersistenceFixture {
  return {
    id,
    title,
    markdown: `# 图片 P1 ${id}\n\nImage persistence seed.\n\n${imageMarkdown}\n`,
    imageMarkdown,
    safe: true,
    expectedImage,
  };
}

export const VISUAL_EDITOR_IMAGE_PERSISTENCE_FIXTURES: VisualImagePersistenceFixture[] = [
  safeFixture(
    "image-local",
    "本地图片",
    "![本地图片](File/assets/local.png)",
    {
      src: "File/assets/local.png",
      alt: "本地图片",
      title: "",
      sourceKind: "local",
      localRel: "File/assets/local.png",
      originalLocalRel: "",
      hostedUrl: "",
      width: "",
      doodledUrl: "",
    },
  ),
  safeFixture(
    "image-hosted",
    "图床图片",
    '![图床图片](https://cdn.example.com/hosted.png "mk-hosted|https://cdn.example.com/hosted.png")',
    {
      src: "https://cdn.example.com/hosted.png",
      alt: "图床图片",
      title: "mk-hosted|https://cdn.example.com/hosted.png",
      sourceKind: "hosted",
      localRel: "",
      originalLocalRel: "",
      hostedUrl: "https://cdn.example.com/hosted.png",
      width: "",
      doodledUrl: "",
    },
  ),
  safeFixture(
    "image-doodled",
    "涂鸦图片",
    '![涂鸦](File/assets/original.png "mk-doodled|https://cdn.example.com/doodle.png")',
    {
      src: "File/assets/original.png",
      alt: "涂鸦",
      title: "mk-doodled|https://cdn.example.com/doodle.png",
      sourceKind: "doodled",
      localRel: "File/assets/original.png",
      originalLocalRel: "File/assets/original.png",
      hostedUrl: "",
      width: "",
      doodledUrl: "https://cdn.example.com/doodle.png",
    },
  ),
  safeFixture(
    "image-width",
    "宽度图片",
    '![宽图](File/assets/wide.png "w:640px")',
    {
      src: "File/assets/wide.png",
      alt: "宽图",
      title: "w:640px",
      sourceKind: "local",
      localRel: "File/assets/wide.png",
      originalLocalRel: "",
      hostedUrl: "",
      width: "640",
      doodledUrl: "",
    },
  ),
  safeFixture(
    "image-data",
    "白名单 PNG Data URL",
    "![内嵌图](data:image/png;base64,iVBORw0KGgo=)",
    {
      src: "data:image/png;base64,iVBORw0KGgo=",
      alt: "内嵌图",
      title: "",
      sourceKind: "data",
      localRel: "",
      originalLocalRel: "",
      hostedUrl: "",
      width: "",
      doodledUrl: "",
    },
  ),
  {
    id: "image-dangerous",
    title: "危险图片源",
    markdown: "# 图片 P1 image-dangerous\n\nImage persistence seed.\n\n![危险图片](javascript:alert%281%29)\n",
    imageMarkdown: "![危险图片](javascript:alert%281%29)",
    safe: false,
  },
];
