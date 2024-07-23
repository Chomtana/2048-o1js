
export const combineBits = (bits: number[]): number => bits.reduce((acc, bit, index) => acc | (bit << (bits.length - 1 - index)), 0);
export const numberToBits = (num: number, length: number): number[] => Array.from({ length }, (_, i) => (num >> (length - 1 - i)) & 1);