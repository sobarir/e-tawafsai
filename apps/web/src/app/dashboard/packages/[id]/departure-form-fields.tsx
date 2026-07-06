"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CreateDepartureInput } from "@cometkit/shared";

export type DeparturePayload = Omit<CreateDepartureInput, "packageId">;

export interface DepartureFormFieldsHandle {
  /** Assemble the departure payload, or null when no departure date is entered. */
  buildPayload: () => DeparturePayload | null;
  /** Reset all fields to their defaults. */
  reset: () => void;
}

const DEFAULTS = {
  depDate: "",
  retDate: "",
  seatTotal: 45,
  priceQuad: 35000000,
  dpAmount: 5000000,
};

export const DepartureFormFields = forwardRef<DepartureFormFieldsHandle>(
  function DepartureFormFields(_props, ref) {
    const [depDate, setDepDate] = useState(DEFAULTS.depDate);
    const [retDate, setRetDate] = useState(DEFAULTS.retDate);
    const [seatTotal, setSeatTotal] = useState<number>(DEFAULTS.seatTotal);
    const [dpAmount, setDpAmount] = useState<number>(DEFAULTS.dpAmount);
    const [priceQuad, setPriceQuad] = useState<number>(DEFAULTS.priceQuad);
    const [priceTriple, setPriceTriple] = useState<number | "">("");
    const [priceDouble, setPriceDouble] = useState<number | "">("");
    const [priceQuadDiscount, setPriceQuadDiscount] = useState<number | "">("");
    const [priceTripleDiscount, setPriceTripleDiscount] = useState<number | "">("");
    const [priceDoubleDiscount, setPriceDoubleDiscount] = useState<number | "">("");

    useImperativeHandle(ref, () => ({
      buildPayload: () => {
        // "Filled" detection: a departure date is the unambiguous signal.
        if (!depDate) return null;
        const nullable = (v: number | "") => (v === "" ? null : v);
        return {
          departureType: "fixed_date",
          departureDate: new Date(depDate).toISOString(),
          // Empty return date fails the schema's datetime() check → field error surfaced.
          returnDate: retDate ? new Date(retDate).toISOString() : "",
          seatTotal,
          currency: "IDR",
          priceQuad,
          priceTriple: nullable(priceTriple),
          priceDouble: nullable(priceDouble),
          priceQuadDiscount: nullable(priceQuadDiscount),
          priceTripleDiscount: nullable(priceTripleDiscount),
          priceDoubleDiscount: nullable(priceDoubleDiscount),
          dpAmount,
          // Payment schedule derives from the NORMAL quad price only.
          paymentSchedule: [
            { name: "DP", amount: dpAmount, daysBeforeDeparture: 60 },
            { name: "Pelunasan", amount: priceQuad - dpAmount, daysBeforeDeparture: 30 },
          ],
        };
      },
      reset: () => {
        setDepDate(DEFAULTS.depDate);
        setRetDate(DEFAULTS.retDate);
        setSeatTotal(DEFAULTS.seatTotal);
        setDpAmount(DEFAULTS.dpAmount);
        setPriceQuad(DEFAULTS.priceQuad);
        setPriceTriple("");
        setPriceDouble("");
        setPriceQuadDiscount("");
        setPriceTripleDiscount("");
        setPriceDoubleDiscount("");
      },
    }));

    const num = (v: string): number | "" => (v === "" ? "" : Number(v));

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="depDate" className="text-xs">Departure date</Label>
            <Input id="depDate" type="date" value={depDate}
              onChange={(e) => setDepDate(e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="retDate" className="text-xs">Return date</Label>
            <Input id="retDate" type="date" value={retDate}
              onChange={(e) => setRetDate(e.target.value)} className="h-8 text-xs" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="seatTotalInput" className="text-xs">Total seats</Label>
            <Input id="seatTotalInput" type="number" value={seatTotal}
              onChange={(e) => setSeatTotal(Number(e.target.value))} className="h-8 text-xs" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="dpAmountInput" className="text-xs">DP amount (Rp)</Label>
            <Input id="dpAmountInput" type="number" value={dpAmount}
              onChange={(e) => setDpAmount(Number(e.target.value))} className="h-8 text-xs" />
          </div>
        </div>

        <div className="grid gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Price matrix — normal / discounted (Rp)
          </span>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="priceQuadInput" className="text-xs">Quad — normal</Label>
              <Input id="priceQuadInput" type="number" value={priceQuad}
                onChange={(e) => setPriceQuad(Number(e.target.value))} className="h-8 text-xs" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="priceQuadDiscountInput" className="text-xs">Quad — discounted</Label>
              <Input id="priceQuadDiscountInput" type="number" value={priceQuadDiscount}
                onChange={(e) => setPriceQuadDiscount(num(e.target.value))}
                placeholder="optional" className="h-8 text-xs" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="priceTripleInput" className="text-xs">Triple — normal</Label>
              <Input id="priceTripleInput" type="number" value={priceTriple}
                onChange={(e) => setPriceTriple(num(e.target.value))}
                placeholder="optional" className="h-8 text-xs" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="priceTripleDiscountInput" className="text-xs">Triple — discounted</Label>
              <Input id="priceTripleDiscountInput" type="number" value={priceTripleDiscount}
                onChange={(e) => setPriceTripleDiscount(num(e.target.value))}
                placeholder="optional" className="h-8 text-xs" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="priceDoubleInput" className="text-xs">Double — normal</Label>
              <Input id="priceDoubleInput" type="number" value={priceDouble}
                onChange={(e) => setPriceDouble(num(e.target.value))}
                placeholder="optional" className="h-8 text-xs" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="priceDoubleDiscountInput" className="text-xs">Double — discounted</Label>
              <Input id="priceDoubleDiscountInput" type="number" value={priceDoubleDiscount}
                onChange={(e) => setPriceDoubleDiscount(num(e.target.value))}
                placeholder="optional" className="h-8 text-xs" />
            </div>
          </div>
        </div>
      </div>
    );
  },
);
