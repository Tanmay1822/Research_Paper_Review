import DashboardLayout from '@/components/DashboardLayout';

export default function Home() {
  return (
    <DashboardLayout>
      <div className="flex h-full w-full">
        {/* Left Half: Chat Interface Placeholder */}
        <div className="w-1/2 border-r border-gray-200 bg-white p-4 flex flex-col justify-center items-center">
          <h2 className="text-xl font-bold text-gray-800 mb-2">Chat Interface</h2>
          <p className="text-gray-500">Comming Soon...</p>
        </div>

        {/* Right Half: PDF Viewer Placeholder */}
        <div className="w-1/2 bg-gray-50 p-4 flex flex-col justify-center items-center">
          <h2 className="text-xl font-bold text-gray-800 mb-2">PDF Viewer</h2>
          <p className="text-gray-500">No Document Selected</p>
        </div>
      </div>
    </DashboardLayout>
  );
}
