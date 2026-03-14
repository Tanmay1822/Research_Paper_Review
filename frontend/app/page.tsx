"use client";

import { useState } from "react";
import ChatInterface from "@/components/ChatInterface";
import PdfViewer from "@/components/PdfViewer";
import Sidebar, { type Paper } from "@/components/Sidebar";

export default function Home() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [selectedPage, setSelectedPage] = useState<number | null>(null);

  const handleCitationClick = (source: string, page: number) => {
    setSelectedSource(source);
    setSelectedPage(page);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-100">
      {/* Left: Sidebar (30%) */}
      <aside className="w-[30%] min-w-[240px] max-w-[360px] flex-shrink-0">
        <Sidebar papers={papers} onPapersChange={setPapers} />
      </aside>

      {/* Middle: Chat (40%) */}
      <section className="w-[40%] flex-shrink-0 border-r border-gray-200">
        <ChatInterface
          papers={papers}
          onCitationClick={handleCitationClick}
        />
      </section>

      {/* Right: PDF Viewer (30%) */}
      <section className="flex-1 min-w-0">
        <PdfViewer
          papers={papers}
          selectedSource={selectedSource}
          selectedPage={selectedPage}
        />
      </section>
    </div>
  );
}
