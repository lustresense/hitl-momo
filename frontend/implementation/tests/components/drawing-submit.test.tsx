import {afterEach,it,expect,vi} from "vitest";
import {render,screen,cleanup,fireEvent} from "@testing-library/react";
import {DrawingScreen} from "@/src/components/drawing/DrawingScreen";
import {LEVELS} from "@/src/domain/levels";
vi.mock("@/src/input",()=>({DrawingSurface:class {store={endStroke(){},eraseAt:()=>false,hasActiveStroke:()=>false,lastActivePoint:()=>null};resizeForDpr(){} dispose(){} setMode(){return Promise.resolve();}}}));
afterEach(cleanup);
it("shows explicit disabled prediction submit before ink and no placeholder catalog",()=>{render(<DrawingScreen level={LEVELS[0]!} initialMode="pointer" feedback={null} surfaceOut={{current:null}} onSubmit={vi.fn()} onExit={vi.fn()}/>);// Camera mode (the default) keeps Tebak behind "Bantuan": open it first, as a student would.
fireEvent.click(screen.getByTestId("btn-drawing-help"));expect(screen.getByTestId("btn-submit-drawing").hasAttribute("disabled")).toBe(true);expect(screen.queryByText(/Katalog DEMO/)).toBeNull();expect(screen.queryByLabelText("Tebakan AI")).toBeNull();});
