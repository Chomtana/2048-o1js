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
  Experimental
} from 'o1js';

import { Board } from './game2048.js'

const { OffchainState, OffchainStateCommitments } = Experimental;

export { Offchain2048, offchain2048State };

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

const offchain2048State = OffchainState({
  // The board is serialized as a single field element
  board: OffchainState.Map(PublicKey, Field),
  maxScore: OffchainState.Map(PublicKey, UInt32),
  gameCount: OffchainState.Map(PublicKey, UInt32),
});

class Offchain2048 extends SmartContract {
  // The board is serialized as a single field element
  @state(Field) board = State<Field>();
  // defaults to false, set to true when a player wins
  @state(Bool) gameDone = State<Bool>();
  // the two players who are allowed to play
  @state(PublicKey) player = State<PublicKey>();

  @state(OffchainStateCommitments) offchainState = State(
    OffchainStateCommitments.empty()
  );

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
    const player = this.player.getAndRequireEquals();
    pubkey.equals(player).assertTrue();

    // 3. get and deserialize the board
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
