/**
 * This file defines the `TicTacToe` smart contract and the helpers it needs.
 */

import {
  Field,
  State,
  PublicKey,
  SmartContract,
  state,
  method,
  Bool,
  UInt32,
  Provable,
  Signature,
  Struct,
} from 'o1js';

export { Board, Game2048 };

const BOARD_ROWS = 4
const BOARD_COLS = 4
const NUM_BITS = 5

function Optional<T>(type: Provable<T>) {
  return class Optional_ extends Struct({ isSome: Bool, value: type }) {
    constructor(isSome: boolean | Bool, value: T) {
      super({ isSome: Bool(isSome), value });
    }

    toFields() {
      return Optional_.toFields(this);
    }
  };
}

class OptionalBool extends Optional(Bool) {}

class Board {
  board: UInt32[][];
  ended: Bool;
  score: UInt32;

  constructor(serializedBoard: Field) {
    const bits = serializedBoard.toBits(BOARD_ROWS * BOARD_COLS * NUM_BITS + 33);
    let board = [];
    for (let i = 0; i < BOARD_ROWS; i++) {
      let row = [];
      for (let j = 0; j < BOARD_COLS; j++) {
        const pos = i * BOARD_COLS + j
        const numBits = bits.slice(pos * NUM_BITS, pos * NUM_BITS + NUM_BITS)
        row.push(new UInt32(this.combineBits(numBits)));
      }
      board.push(row);
    }
    this.ended = bits[BOARD_ROWS * BOARD_COLS * NUM_BITS]
    this.score = new UInt32(this.combineBits(bits.slice(BOARD_ROWS * BOARD_COLS * NUM_BITS + 1), 31))
    this.board = board;
  }

  combineBits(bits: Bool[], bitCount = NUM_BITS): UInt32 {
    let result = new UInt32(0)
    for (let i = 0; i < bitCount; i++) {
      result = result.add(
        Provable.if(
          bits[bitCount - i - 1],
          new UInt32(1 << i),
          UInt32.zero,
        )
      )
    }
    return result
  }

  numberToBits(num: UInt32, bitCount = NUM_BITS): Bool[] {
    let bits: Bool[] = [];
    for (let i = bitCount - 1; i >= 0; i--) {
      bits.push(num.greaterThanOrEqual(new UInt32(1 << i)))
      num = num.mod(1 << i)
    }
    return bits
  }

  // Support 1 - 17 which is the most number one can reach
  pow2(num: UInt32): UInt32 {
    let result = new UInt32(0)

    for (let i = 1; i < 18; i++) {
      result = result.add(
        Provable.if(
          new UInt32(i).equals(num),
          new UInt32(1 << i),
          UInt32.zero,
        )
      )
    }

    return result
  }

  serialize(): Field {
    let bits: Bool[] = [];
    for (let i = 0; i < BOARD_ROWS; i++) {
      for (let j = 0; j < BOARD_COLS; j++) {
        bits = bits.concat(
          this.numberToBits(this.board[i][j])
        )
      }
    }

    bits = bits.concat([
      this.ended,
      ...this.numberToBits(this.score, 31),
    ])

    return Field.fromBits(bits);
  }

  hasNextMove(): Bool {
    let has = new Bool(false);

    // check missing cell
    for (let i = 0; i < BOARD_ROWS; i++) {
      for (let j = 0; j < BOARD_COLS; j++) {
        let row = this.board[i][j];
        has = has.or(row.equals(UInt32.zero))
      }
    }

    // check adjacent rows
    for (let j = 0; j < BOARD_COLS; j++) {
      for (let i = 0; i < BOARD_ROWS - 1; i++) {
        let a = this.board[i][j]
        let b = this.board[i+1][j]
        has = has.or(a.equals(b))
      }
    }

    // check adjacent cols
    for (let i = 0; i < BOARD_ROWS; i++) {
      for (let j = 0; j < BOARD_COLS - 1; j++) {
        let a = this.board[i][j]
        let b = this.board[i][j+1]
        has = has.or(a.equals(b))
      }
    }

    return has
  }

  newTile(r: Field, c: Field, num: UInt32) {
    num.assertGreaterThan(new UInt32(0));

    for (let i = 0; i < BOARD_ROWS; i++) {
      for (let j = 0; j < BOARD_COLS; j++) {
        // is this the cell the player wants to play?
        const toUpdate = r.equals(new Field(i)).and(c.equals(new Field(j)));

        // make sure we can add a tile there
        toUpdate.implies(this.board[i][j].equals(UInt32.zero)).assertEquals(true);

        // copy the board (or update if this is the cell the player wants to play)
        this.board[i][j] = Provable.if(
          toUpdate,
          new UInt32(num),
          this.board[i][j]
        );
      }
    }

    this.ended = this.hasNextMove().not()
  }

  moveTile(c: [number, number], a: [number, number], breakLoop: Bool) {
    const curr = this.board[c[0]][c[1]]
    const adj = this.board[a[0]][a[1]]

    const currEmpty = curr.equals(UInt32.zero)
    const adjEmpty = adj.equals(UInt32.zero)
    const eq = curr.equals(adj)

    this.score = this.score.add(
      Provable.if(
        eq.and(currEmpty.not()).and(breakLoop.not()),
        this.pow2(this.board[a[0]][a[1]].add(UInt32.one)),
        UInt32.zero,
      )
    )

    this.board[a[0]][a[1]] = Provable.if(
      currEmpty.or(breakLoop),
      this.board[a[0]][a[1]],
      Provable.if(
        adjEmpty,
        this.board[c[0]][c[1]],
        Provable.if(
          eq,
          this.board[a[0]][a[1]].add(UInt32.one),
          this.board[a[0]][a[1]],
        )
      )
    )

    this.board[c[0]][c[1]] = Provable.if(
      currEmpty.or(breakLoop),
      this.board[c[0]][c[1]],
      Provable.if(
        adjEmpty.or(eq),
        UInt32.zero,
        this.board[c[0]][c[1]],
      )
    )

    // console.log(c, a, this.board[c[0]][c[1]].toString(), this.board[a[0]][a[1]].toString(), currEmpty.toString(), adjEmpty.toString(), eq.toString())

    return adjEmpty.not()
  }

  moveUp() {
    // Loop will be break if adj is not empty
    let breakLoop = new Bool(false);

    for (let j = 0; j < BOARD_COLS; j++) {
      for (let i = 1; i < BOARD_ROWS; i++) {
        const k = i;
        for (let m = k; m > 0; m--) {
          breakLoop = this.moveTile([m, j], [m-1, j], breakLoop)
        }
        breakLoop = new Bool(false)
      }
    }

    this.ended = this.hasNextMove().not()
  }

  moveDown() {
    // Loop will be break if adj is not empty
    let breakLoop = new Bool(false);

    for (let j = 0; j < BOARD_COLS; j++) {
      for (let i = BOARD_ROWS - 2; i >= 0; i--) {
        const k = i;
        for (let m = k; m < BOARD_ROWS - 1; m++) {
          breakLoop = this.moveTile([m, j], [m+1, j], breakLoop)
        }
        breakLoop = new Bool(false)
      }
    }

    this.ended = this.hasNextMove().not()
  }

  moveLeft() {
    // Loop will be break if adj is not empty
    let breakLoop = new Bool(false);

    for (let i = 0; i < BOARD_ROWS; i++) {
      for (let j = 1; j < BOARD_COLS; j++) {
        const k = j;
        for (let m = k; m > 0; m--) {
          breakLoop = this.moveTile([i, m], [i, m-1], breakLoop)
        }
        breakLoop = new Bool(false)
      }
    }

    this.ended = this.hasNextMove().not()
  }

  moveRight() {
    // Loop will be break if adj is not empty
    let breakLoop = new Bool(false);

    for (let i = 0; i < BOARD_ROWS; i++) {
      for (let j = BOARD_COLS - 2; j >= 0; j--) {
        const k = j;
        for (let m = k; m < BOARD_COLS - 1; m++) {
          breakLoop = this.moveTile([i, m], [i, m+1], breakLoop)
        }
        breakLoop = new Bool(false)
      }
    }

    this.ended = this.hasNextMove().not()
  }

  // Debugging functions

  printState() {
    for (let i = 0; i < BOARD_ROWS; i++) {
      let row = '| ';
      for (let j = 0; j < BOARD_COLS; j++) {
        let num = 1 << parseInt(this.board[i][j].toString())
        if (num == 1) num = 0
        let token = num.toString().padStart(4, ' ')
        row += token + ' | ';
      }
      row += ' |'
      console.log(row);
    }
    console.log('Score:', Number(this.score.toBigint()))
    console.log('---\n');
  }

  toArray(): number[][] {
    const result: number[][] = []
    for (let i = 0; i < BOARD_ROWS; i++) {
      const row: number[] = []
      for (let j = 0; j < BOARD_COLS; j++) {
        row.push(parseInt(this.board[i][j].toString()))
      }
      result.push(row)
    }
    return result
  }

  randomEmptyTile(): [number, number] {
    const emptyTiles: [number, number][] = []

    const tiles = this.toArray()

    for (let i = 0; i < BOARD_ROWS; i++) {
      for (let j = 0; j < BOARD_COLS; j++) {
        if (!tiles[i][j]) {
          emptyTiles.push([i, j])
        }
      }
    }

    if (emptyTiles.length == 0) return [-1, -1]

    return emptyTiles[Math.floor(Math.random() * emptyTiles.length)]
  }
}

class Game2048 extends SmartContract {
  // The board is serialized as a single field element
  @state(Field) board = State<Field>();
  // defaults to false, set to true when a player wins
  @state(Bool) gameDone = State<Bool>();
  // the two players who are allowed to play
  @state(PublicKey) player = State<PublicKey>();

  init() {
    super.init();
    this.gameDone.set(Bool(true));
    this.player.set(PublicKey.empty());
  }

  @method async startGame(player: PublicKey) {
    // you can only start a new game if the current game is done
    this.gameDone.requireEquals(Bool(true));
    this.gameDone.set(Bool(false));
    // set players
    this.player.set(player);
    // reset board
    this.board.set(Field(0));
  }

  setGameDone(board: Board) {
    const won = board.hasNextMove();
    this.gameDone.set(won.not());
  }

  assertSignature(
    pubkey: PublicKey,
    signature: Signature,
    action: Field,
    value: Field,
  ) {
    // 1. if the game is already finished, abort.
    this.gameDone.requireEquals(Bool(false)); // precondition on this.gameDone

    // 2. ensure that we know the private key associated to the public key
    //    and that our public key is known to the zkApp

    // ensure player owns the associated private key
    signature.verify(pubkey, [action, value]).assertTrue();

    // ensure player is valid
    const player = this.player.getAndRequireEquals();
    pubkey.equals(player).assertTrue();

    // 3. get and deserialize the board
    this.board.requireEquals(this.board.get()); // precondition that links this.board.get() to the actual on-chain state
    let board = new Board(this.board.get());

    return board
  }

  @method async addTile(
    pubkey: PublicKey,
    signature: Signature,
    r: Field,
    c: Field,
  ) {
    const board = this.assertSignature(
      pubkey,
      signature,
      Field(2),
      r.mul(Field(BOARD_COLS)).add(c)
    )

    board.newTile(r, c, UInt32.one)
    this.board.set(board.serialize())

    this.setGameDone(board)
  }

  @method async moveUp(
    pubkey: PublicKey,
    signature: Signature,
  ) {
    const board = this.assertSignature(
      pubkey,
      signature,
      Field(1),
      Field(0)
    )

    board.moveUp()
    this.board.set(board.serialize())

    this.setGameDone(board)
  }

  @method async moveDown(
    pubkey: PublicKey,
    signature: Signature,
  ) {
    const board = this.assertSignature(
      pubkey,
      signature,
      Field(1),
      Field(1)
    )

    board.moveDown()
    this.board.set(board.serialize())

    this.setGameDone(board)
  }

  @method async moveLeft(
    pubkey: PublicKey,
    signature: Signature,
  ) {
    const board = this.assertSignature(
      pubkey,
      signature,
      Field(1),
      Field(2)
    )

    board.moveLeft()
    this.board.set(board.serialize())

    this.setGameDone(board)
  }

  @method async moveRight(
    pubkey: PublicKey,
    signature: Signature,
  ) {
    const board = this.assertSignature(
      pubkey,
      signature,
      Field(1),
      Field(3)
    )

    board.moveRight()
    this.board.set(board.serialize())

    this.setGameDone(board)
  }

  @method async endGame(
    pubkey: PublicKey,
    signature: Signature,
  ) {
    this.assertSignature(
      pubkey,
      signature,
      Field(3),
      Field(0)
    )

    this.gameDone.set(Bool(true))
  }
}
