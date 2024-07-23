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
import { combineBits, numberToBits } from './utils';

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

  constructor(serializedBoard: Field) {
    const bits = serializedBoard.toBits(BOARD_ROWS * BOARD_COLS * NUM_BITS);
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
    this.board = board;
  }

  combineBits(bits: Bool[]): UInt32 {
    let result = new UInt32(1)
    for (let i = 0; i < NUM_BITS; i++) {
      result = result.add(
        Provable.if(
          bits[NUM_BITS - i - 1],
          new UInt32(1 << i),
          UInt32.zero,
        )
      )
    }
    return result
  }

  numberToBits(num: UInt32): Bool[] {
    let bits: Bool[] = [];
    for (let i = NUM_BITS - 1; i >= 0; i--) {
      bits.push(num.greaterThanOrEqual(new UInt32(1 << i)))
      num = num.mod(1 << i)
    }
    return bits
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
    return Field.fromBits(bits);
  }

  newTile(x: Field, y: Field, num: UInt32) {
    num.assertGreaterThan(new UInt32(0));

    for (let i = 0; i < BOARD_ROWS; i++) {
      for (let j = 0; j < BOARD_COLS; j++) {
        // is this the cell the player wants to play?
        const toUpdate = x.equals(new Field(i)).and(y.equals(new Field(j)));

        // make sure we can play there
        toUpdate.and(this.board[i][j].equals(UInt32.zero)).assertEquals(true);

        // copy the board (or update if this is the cell the player wants to play)
        this.board[i][j] = Provable.if(
          toUpdate,
          new UInt32(num),
          this.board[i][j]
        );
      }
    }
  }

  // update(x: Field, y: Field, playerToken: Bool) {
  //   for (let i = 0; i < 3; i++) {
  //     for (let j = 0; j < 3; j++) {
  //       // is this the cell the player wants to play?
  //       const toUpdate = x.equals(new Field(i)).and(y.equals(new Field(j)));

  //       // make sure we can play there
  //       toUpdate.and(this.board[i][j].isSome).assertEquals(false);

  //       // copy the board (or update if this is the cell the player wants to play)
  //       this.board[i][j] = Provable.if(
  //         toUpdate,
  //         new OptionalBool(true, playerToken),
  //         this.board[i][j]
  //       );
  //     }
  //   }
  // }

  printState() {
    for (let i = 0; i < BOARD_ROWS; i++) {
      let row = '| ';
      for (let j = 0; j < BOARD_COLS; j++) {
        let token = this.board[i][j].toString().padStart(4, ' ')
        row += token + ' | ';
      }
      row += ' |'
      console.log(row);
    }
    console.log('---\n');
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

  moveTile(c: [number, number], a: [number, number], breakLoop: Bool) {
    const curr = this.board[c[0]][c[1]]
    const adj = this.board[a[0]][a[1]]

    const currEmpty = curr.equals(UInt32.zero)
    const adjEmpty = adj.equals(UInt32.zero)
    const eq = curr.equals(adj)

    this.board[c[0]][c[1]] = Provable.if(
      currEmpty.or(breakLoop),
      this.board[c[0]][c[1]],
      Provable.if(
        adjEmpty.or(eq),
        UInt32.zero,
        this.board[c[0]][c[1]],
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
          this.board[c[0]][c[1]].add(UInt32.one),
          this.board[a[0]][a[1]],
        )
      )
    )

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
      }
    }
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
      }
    }
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
      }
    }
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
      }
    }
  }
}

class Game2048 extends SmartContract {
  // The board is serialized as a single field element
  @state(Field) board = State<Field>();
  // false -> player 1 | true -> player 2
  @state(Bool) nextIsPlayer2 = State<Bool>();
  // defaults to false, set to true when a player wins
  @state(Bool) gameDone = State<Bool>();
  // the two players who are allowed to play
  @state(PublicKey) player1 = State<PublicKey>();
  @state(PublicKey) player2 = State<PublicKey>();

  init() {
    super.init();
    this.gameDone.set(Bool(true));
    this.player1.set(PublicKey.empty());
    this.player2.set(PublicKey.empty());
  }

  @method async startGame(player1: PublicKey, player2: PublicKey) {
    // you can only start a new game if the current game is done
    this.gameDone.requireEquals(Bool(true));
    this.gameDone.set(Bool(false));
    // set players
    this.player1.set(player1);
    this.player2.set(player2);
    // reset board
    this.board.set(Field(0));
    // player 1 starts
    this.nextIsPlayer2.set(Bool(false));
  }

  // board:
  //  x  0  1  2
  // y +----------
  // 0 | x  x  x
  // 1 | x  x  x
  // 2 | x  x  x
  @method async play(
    pubkey: PublicKey,
    signature: Signature,
    x: Field,
    y: Field
  ) {
    // 1. if the game is already finished, abort.
    this.gameDone.requireEquals(Bool(false)); // precondition on this.gameDone

    // 2. ensure that we know the private key associated to the public key
    //    and that our public key is known to the zkApp

    // ensure player owns the associated private key
    signature.verify(pubkey, [x, y]).assertTrue();

    // ensure player is valid
    const player1 = this.player1.getAndRequireEquals();
    const player2 = this.player2.getAndRequireEquals();
    Bool.or(pubkey.equals(player1), pubkey.equals(player2)).assertTrue();

    // 3. Make sure that its our turn,
    //    and set the state for the next player

    // get player token
    const player = pubkey.equals(player2); // player 1 is false, player 2 is true

    // ensure its their turn
    const nextPlayer = this.nextIsPlayer2.getAndRequireEquals();
    nextPlayer.assertEquals(player);

    // set the next player
    this.nextIsPlayer2.set(player.not());

    // 4. get and deserialize the board
    this.board.requireEquals(this.board.get()); // precondition that links this.board.get() to the actual on-chain state
    let board = new Board(this.board.get());

    // 5. update the board (and the state) with our move
    x.equals(Field(0))
      .or(x.equals(Field(1)))
      .or(x.equals(Field(2)))
      .assertTrue();
    y.equals(Field(0))
      .or(y.equals(Field(1)))
      .or(y.equals(Field(2)))
      .assertTrue();

    // board.update(x, y, player);
    this.board.set(board.serialize());

    // 6. did I just win? If so, update the state as well
    // const won = board.checkWinner();
    // this.gameDone.set(won);
  }
}
