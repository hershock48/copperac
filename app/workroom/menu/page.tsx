import Gate from "@/components/workroom/Gate";
import MenuEditor from "@/components/workroom/MenuEditor";
import { isWorkroomAuthed } from "@/lib/workroom/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Menu" };

export default async function WorkroomMenuPage() {
  return (
    <Gate initialAuthed={await isWorkroomAuthed()}>
      <MenuEditor />
    </Gate>
  );
}
