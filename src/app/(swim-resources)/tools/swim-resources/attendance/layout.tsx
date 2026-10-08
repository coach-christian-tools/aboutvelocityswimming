
export const metadata = {
  title: 'Attendance | Velocity Swimming',
  description: 'Team attendance tracking',
};

export default function AttendanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-4xl mx-auto h-[100dvh] flex flex-col relative overflow-hidden bg-bg">
      {children}
    </div>
  );
}
