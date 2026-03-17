interface GuidePreviewProps {
  html: string;
}

export default function GuidePreview({ html }: GuidePreviewProps) {
  return (
    <iframe
      srcDoc={html}
      sandbox="allow-same-origin"
      className="w-full flex-1 border border-gray-200 rounded bg-white"
      style={{ minHeight: '400px' }}
      title="Guide Preview"
    />
  );
}
