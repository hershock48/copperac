import Gate from "@/components/workroom/Gate";
import EventsScreen from "@/components/workroom/EventsScreen";
import { isWorkroomAuthed } from "@/lib/workroom/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Events" };

export default async function WorkroomEventsPage() {
  return (
    <Gate initialAuthed={await isWorkroomAuthed()}>
      <EventsScreen />
    </Gate>
  );
}
